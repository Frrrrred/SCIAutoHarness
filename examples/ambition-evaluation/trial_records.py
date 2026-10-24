"""Parent-owned immutable dispatches and append-only observed events; not authentication."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re

METRICS=('toolCallsObserved','tokens','firstUsefulResultUtc','humanSupplementation','replanning','unnecessaryApprovals')

def digest(data):return hashlib.sha256(data).hexdigest()
def utc():return datetime.now(timezone.utc).isoformat()
def json_bytes(value):return (json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
def valid_sha(value):return isinstance(value,str) and re.fullmatch('[0-9a-f]{64}',value) is not None

def derive_safe_context(raw):
    """Projection of actual native context, never a replacement approval/state."""
    review=raw.get('review',{})
    safe_review={k:review[k] for k in ['approved','revision','digest'] if k in review}
    if isinstance(review.get('approval'),dict):
        safe_review['approval']={k:review['approval'][k] for k in ['actor','decision','taskId','revision','digest'] if k in review['approval']}
    allowed_active=['step','runId','startedAt','reviewDigest','reviewBinding','executionBinding','executionBindingStatus']
    return {'viewKind':'derived-solver-context-v1','review':safe_review,
        'currentStatus':raw.get('currentStatus'),'canBegin':raw.get('canBegin'),
        'activeExecutions':[{k:v for k,v in x.items() if k in allowed_active} for x in raw.get('activeExecutions',[])],
        'executionBlockers':raw.get('executionBlockers',[]),'blockers':raw.get('blockers',[]),
        'dependencies':[{'id':d['id'],'status':d['status'],
            'outputs':[{k:o[k] for k in ['id','sha256'] if k in o} for o in d.get('outputs',[])]} for d in raw.get('dependencies',[])]}

def context_errors(context,value):
    if not isinstance(context,dict):return ['context_not_object']
    errors=[]
    allowed={'viewKind','review','currentStatus','canBegin','activeExecutions','executionBlockers','blockers','dependencies'}
    if set(context)-allowed:errors.append('private_context_body')
    review=context.get('review')
    if not isinstance(review,dict):return errors+['current_approval']
    if set(review)-{'approved','revision','digest','approval'}:errors.append('review_body')
    if review.get('approved') is not True or review.get('digest')!=value.get('approvalDigest'):errors.append('current_approval')
    if 'approval' in review:
        approval=review['approval']
        if not isinstance(approval,dict) or set(approval)-{'actor','decision','taskId','revision','digest'}:errors.append('approval_body')
    active=context.get('activeExecutions')
    if not isinstance(active,list):return errors+['original_active_run']
    if not any(isinstance(x,dict) and x.get('runId')==value.get('parentRunId') and x.get('step')==value.get('phase') for x in active):
        errors.append('original_active_run')
    for item in active:
        if not isinstance(item,dict) or set(item)-{'step','runId','startedAt','reviewDigest','reviewBinding','executionBinding','executionBindingStatus'}:
            errors.append('active_body');continue
        for key,fields in [('reviewBinding',{'version','status','source'}),('executionBinding',{'version','host','mode','executor'})]:
            if key in item and (not isinstance(item[key],dict) or set(item[key])-fields):errors.append('active_'+key+'_body')
        if item.get('runId')!=value.get('parentRunId') or item.get('step')!=value.get('phase'):errors.append('other_active_execution')
        if item.get('executionBinding')!={'version':1,'host':'codex','mode':'native','executor':'codex-native'}:errors.append('original_host_mode')
        if item.get('reviewDigest')!=value.get('approvalDigest'):errors.append('original_review_digest')
    if 'blockers' not in context or 'dependencies' not in context:errors.append('context_validity_omitted')
    if not isinstance(context.get('blockers'),list) or any(not isinstance(x,str) for x in context.get('blockers',[])):errors.append('blocker_shape')
    if context.get('executionBlockers',[]):errors.append('ambiguous_execution_blockers')
    deps=context.get('dependencies')
    if not isinstance(deps,list):return errors+['dependency_shape']
    for d in deps:
        if not isinstance(d,dict) or set(d)-{'id','status','outputs'}:errors.append('dependency_body');continue
        if d.get('status')!='verified':errors.append('dependency_not_verified')
        if not isinstance(d.get('outputs',[]),list):errors.append('dependency_output_shape');continue
        for output in d.get('outputs',[]):
            if not isinstance(output,dict) or set(output)-{'id','sha256'} or not valid_sha(output.get('sha256')):
                errors.append('dependency_output_body')
    return errors

def validate_metrics(metrics):
    if not isinstance(metrics,dict) or set(metrics)!=set(METRICS):return False
    for item in metrics.values():
        if not isinstance(item,dict) or item.get('status') not in ['observed','unavailable'] or not isinstance(item.get('source'),str) or not item['source']:
            return False
        if item['status']=='unavailable' and (item.get('value') is not None or not item.get('reason')):return False
        if item['status']=='observed' and item.get('value') is None:return False
    return True
def new_file(path,data):
    path=Path(path)
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('xb') as f:f.write(data)
    return digest(data)

def validate_dispatch(value):
    errors=[]
    if not isinstance(value,dict):return {'passed':False,'errors':['dispatch_not_object']}
    for field in ['dispatchId','trialId','phase','condition','parentRunId','approvalDigest','caseVersion','sourceIndexSha256','message']:
        if not isinstance(value.get(field),str) or not value[field].strip():errors.append('missing_'+field)
    if value.get('condition') not in ['C0','C1']:errors.append('condition')
    if value.get('host')!='codex' or value.get('executor')!='codex-native':errors.append('host_binding')
    if value.get('role') not in ['single','initial','resume']:errors.append('actor_role')
    if not isinstance(value.get('dispatchId'),str) or not re.fullmatch(r'[a-zA-Z0-9_-]+',value['dispatchId']):errors.append('dispatch_id')
    native=value.get('nativeArguments',{})
    if not isinstance(native,dict) or native.get('message')!=value.get('message') or native.get('fork_turns')!='none':
        errors.append('actual_native_message')
    elif any(k in native for k in ['model','reasoning_effort','thinking']):errors.append('model_override')
    elif not isinstance(native.get('task_name'),str) or not native['task_name']:errors.append('native_task_name')
    materials=value.get('guidanceMaterials')
    if not isinstance(materials,list) or not materials:errors.append('missing_guidance')
    else:
        for item in materials:
            if not isinstance(item,dict) or not isinstance(item.get('text'),str) or not item['text']:
                errors.append('guidance_text');continue
            if item.get('textSha256')!=digest(item['text'].encode('utf-8')):errors.append('guidance_hash')
            if not isinstance(value.get('message'),str) or item['text'] not in value['message']:errors.append('guidance_not_delivered')
            if not isinstance(item.get('source'),str) or not valid_sha(item.get('sourceSha256')):
                errors.append('guidance_source')
    context=value.get('safeContext',{})
    errors+=context_errors(context,value)
    files=value.get('inputFiles')
    if not isinstance(files,list) or not files:errors.append('missing_inputs')
    elif any(not isinstance(i,dict) or not isinstance(i.get('path'),str) or not valid_sha(i.get('sha256')) for i in files):
        errors.append('input_identity')
    return {'passed':not errors,'errors':errors,'scope':'record consistency; not proof of server delivery, cognition or OS isolation'}

def freeze_dispatch(directory,value):
    checked=validate_dispatch(value)
    if not checked['passed']:raise ValueError(checked['errors'])
    directory=Path(directory)
    directory.mkdir(parents=True,exist_ok=False)
    message=value['message'].encode('utf-8')
    new_file(directory/'message.txt',message)
    payload=json_bytes(value['nativeArguments'])
    new_file(directory/'native-arguments.json',payload)
    record={**value,'recordVersion':1,'frozenUtc':utc(),'messageSha256':digest(message),
            'nativeArgumentsSha256':digest(payload),'provenance':'Saved before call; compare actual parent-visible native arguments; not a host signature.'}
    new_file(directory/'dispatch.json',json_bytes(record))
    return record

def events(directory):
    path=Path(directory)/'events.jsonl'
    return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines()] if path.exists() else []

def append_event(directory,kind,details):
    directory=Path(directory)
    dispatch=json.loads((directory/'dispatch.json').read_text(encoding='utf-8'))
    previous=events(directory)
    kinds=[x['kind'] for x in previous]
    if kind=='dispatched' and (kinds or not isinstance(details.get('actorId'),str) or not details['actorId']):
        raise ValueError('dispatch needs first actual actor ID')
    if kind=='dispatched' and (details.get('submittedArguments')!=dispatch['nativeArguments'] or details.get('argumentSource')!='parent-visible-native-call'):
        raise ValueError('actual visible submitted arguments must match the frozen payload')
    if kind=='returned':
        if kinds!=['dispatched'] or details.get('actorId')!=previous[0]['details']['actorId']:
            raise ValueError('return must follow the same actual actor')
        if details.get('messageSha256')!=dispatch['messageSha256']:
            raise ValueError('return message identity differs')
    if kind not in ['dispatched','returned']:raise ValueError('unsupported event')
    event={'sequence':len(previous)+1,'kind':kind,'observedUtc':utc(),'dispatchId':dispatch['dispatchId'],
           'previousEventSha256':digest(json_bytes(previous[-1])) if previous else None,'details':details}
    with (directory/'events.jsonl').open('a',encoding='utf-8',newline='\n') as f:
        f.write(json.dumps(event,ensure_ascii=False)+'\n')
    return event

def save_return(directory,actor_id,text,metrics):
    directory=Path(directory)
    prior=events(directory)
    if len(prior)!=1 or prior[0]['kind']!='dispatched' or prior[0]['details']['actorId']!=actor_id:
        raise ValueError('unobserved or mismatched actor')
    if not validate_metrics(metrics):raise ValueError('each metric needs an observed value or explicit unavailable reason/source')
    raw=text.encode('utf-8')
    response_sha=new_file(directory/'response.md',raw)
    metrics_sha=new_file(directory/'metrics.json',json_bytes(metrics))
    dispatch=json.loads((directory/'dispatch.json').read_text(encoding='utf-8'))
    return append_event(directory,'returned',{'actorId':actor_id,'messageSha256':dispatch['messageSha256'],
        'responseSha256':response_sha,'metricsSha256':metrics_sha,
        'rawReturnSource':'Actual native final text, copied without numeric edits; no full host-event export claimed.'})

def freeze_checkpoint(path,dispatch_directory):
    d=Path(dispatch_directory)
    dispatch=json.loads((d/'dispatch.json').read_text(encoding='utf-8'))
    es=events(d)
    if dispatch['role']!='initial' or [e['kind'] for e in es]!=['dispatched','returned']:
        raise ValueError('checkpoint needs an actually returned initial actor')
    raw=(d/'response.md').read_bytes()
    if digest(raw)!=es[-1]['details']['responseSha256']:raise ValueError('response drift')
    value={k:dispatch[k] for k in ['trialId','condition','phase','parentRunId','approvalDigest','caseVersion','sourceIndexSha256']}
    value.update({'checkpointVersion':1,'provisional':True,'runtimeAccepted':False,'originalActorId':es[0]['details']['actorId'],
        'responseSha256':digest(raw),'responseText':raw.decode('utf-8'),'sourceDispatchSha256':digest((d/'dispatch.json').read_bytes())})
    new_file(path,json_bytes(value))
    return value

def validate_resume(checkpoint,dispatch,*,initial_directory=None):
    errors=[]
    for field in ['trialId','condition','phase','parentRunId','approvalDigest','sourceIndexSha256']:
        if checkpoint.get(field)!=dispatch.get(field):errors.append('resume_'+field)
    if checkpoint.get('provisional') is not True or checkpoint.get('runtimeAccepted') is not False:
        errors.append('checkpoint_not_provisional')
    if checkpoint.get('caseVersion')!='v1' or dispatch.get('caseVersion')!='v2' or dispatch.get('role')!='resume':
        errors.append('unapproved_version_transition')
    text=checkpoint.get('responseText')
    if not isinstance(text,str) or checkpoint.get('responseSha256')!=digest(text.encode('utf-8')):
        errors.append('checkpoint_response_drift')
    if dispatch.get('checkpointSha256')!=digest(json_bytes(checkpoint)):errors.append('checkpoint_file_binding')
    if initial_directory is None:errors.append('missing_initial_record_context')
    else:
        try:
            initial_directory=Path(initial_directory)
            audited=audit_record(initial_directory)
            if not audited['passed']:errors.append('initial_record_invalid')
            original=json.loads((initial_directory/'dispatch.json').read_text(encoding='utf-8'))
            initial_events=events(initial_directory)
            if checkpoint.get('sourceDispatchSha256')!=digest((initial_directory/'dispatch.json').read_bytes()):errors.append('checkpoint_dispatch_source')
            if checkpoint.get('originalActorId')!=initial_events[0]['details']['actorId']:errors.append('checkpoint_actor_source')
            if checkpoint.get('responseSha256')!=digest((initial_directory/'response.md').read_bytes()):errors.append('checkpoint_return_source')
            for key in ['trialId','condition','phase','parentRunId','approvalDigest','caseVersion','sourceIndexSha256']:
                if checkpoint.get(key)!=original.get(key):errors.append('checkpoint_source_'+key)
        except (OSError,ValueError,KeyError,IndexError,TypeError):errors.append('initial_record_unavailable')
    return {'passed':not errors,'errors':errors,'scope':'same original parent run/provisional chain; not process-crash recovery'}

def _audit_record(directory):
    directory=Path(directory)
    value=json.loads((directory/'dispatch.json').read_text(encoding='utf-8'))
    result=validate_dispatch(value)
    errors=list(result['errors'])
    saved_message=(directory/'message.txt').read_bytes()
    saved_arguments=(directory/'native-arguments.json').read_bytes()
    if digest(saved_message)!=value.get('messageSha256'):errors.append('saved_message_drift')
    if digest(saved_arguments)!=value.get('nativeArgumentsSha256'):errors.append('saved_arguments_drift')
    if not isinstance(value.get('message'),str) or saved_message!=value['message'].encode('utf-8'):
        errors.append('saved_message_payload')
    if json.loads(saved_arguments)!=value.get('nativeArguments'):errors.append('saved_arguments_payload')
    es=events(directory)
    if [e.get('kind') for e in es]!=['dispatched','returned']:errors.append('actor_not_terminal')
    else:
        if [e.get('sequence') for e in es]!=[1,2] or any(e.get('dispatchId')!=value['dispatchId'] for e in es):errors.append('event_sequence_identity')
        if es[0]['details'].get('submittedArguments')!=value['nativeArguments']:errors.append('submitted_payload_drift')
        if es[0]['details'].get('argumentSource')!='parent-visible-native-call':errors.append('submitted_argument_provenance')
        if es[1]['details'].get('messageSha256')!=value.get('messageSha256'):errors.append('returned_message_binding')
        if es[0]['details']['actorId']!=es[1]['details']['actorId']:errors.append('actor_identity')
        if digest((directory/'response.md').read_bytes())!=es[1]['details']['responseSha256']:errors.append('raw_return_drift')
        if digest((directory/'metrics.json').read_bytes())!=es[1]['details'].get('metricsSha256'):errors.append('metrics_drift')
        if not validate_metrics(json.loads((directory/'metrics.json').read_text(encoding='utf-8'))):errors.append('metrics_schema')
        if es[1]['previousEventSha256']!=digest(json_bytes(es[0])):errors.append('event_chain')
    return {'passed':not errors,'errors':errors,'provenance':'Parent-observed tool call/return; hashes are integrity checks, not authentication.'}

def audit_record(directory):
    try:return _audit_record(directory)
    except (OSError,ValueError,KeyError,IndexError,TypeError) as exc:
        return {'passed':False,'errors':['record_unavailable_or_malformed: '+str(exc)]}
