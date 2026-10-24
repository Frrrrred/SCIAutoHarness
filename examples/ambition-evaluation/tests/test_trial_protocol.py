"""Synthetic message/recovery records; no native model or scientific trial."""
import copy
import json
import inspect
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import trial_records as records
from check_trials import assess_scenario, check_source_mapping, check_recovery

class TrialProtocolTests(unittest.TestCase):
    def setUp(self):
        self.work=Path(os.environ['EVIDENCE_TEST_ROOT']).resolve(strict=True)
        self.temp=Path(tempfile.mkdtemp(prefix='protocol-',dir=self.work))
        self.assertTrue(self.temp.resolve().is_relative_to(self.work))
        self.addCleanup(self.cleanup)
        guidance='Complete synthetic fixture guidance.\n'
        message='Synthetic task.\n'+guidance
        self.value={'dispatchId':'synthetic-initial','trialId':'W-C0','phase':'s5','condition':'C0',
            'parentRunId':'synthetic-parent-run','approvalDigest':'a'*64,'caseVersion':'v1','sourceIndexSha256':'b'*64,
            'host':'codex','executor':'codex-native','role':'initial','message':message,
            'nativeArguments':{'task_name':'synthetic_actor','fork_turns':'none','message':message},
            'guidanceMaterials':[{'text':guidance,'textSha256':records.digest(guidance.encode()),'source':'fixture-source','sourceSha256':'c'*64}],
            'inputFiles':[{'path':'synthetic.csv','sha256':'d'*64}],
            'safeContext':{'review':{'approved':True,'digest':'a'*64},
                'activeExecutions':[{'step':'s5','runId':'synthetic-parent-run','reviewDigest':'a'*64,
                    'executionBinding':{'version':1,'host':'codex','mode':'native','executor':'codex-native'}}],
                'blockers':['Original run executing; do not begin duplicate'],
                'dependencies':[{'id':'s3','status':'verified'}]}}
        self.directory=self.temp/'record'
        self.metrics={k:{'value':None,'status':'unavailable','source':'synthetic fixture','reason':'Not observed in this test'} for k in records.METRICS}

    def cleanup(self):
        if self.temp.exists():
            if not self.temp.resolve().is_relative_to(self.work):raise RuntimeError('cleanup containment')
            shutil.rmtree(self.temp)

    def freeze(self):return records.freeze_dispatch(self.directory,self.value)
    def dispatch(self):
        return records.append_event(self.directory,'dispatched',{'actorId':'synthetic-actor',
            'submittedArguments':copy.deepcopy(self.value['nativeArguments']),
            'argumentSource':'parent-visible-native-call'})
    def complete(self):
        self.freeze();self.dispatch()
        records.save_return(self.directory,'synthetic-actor','Actual synthetic unit fixture return.\n',self.metrics)

    def test_complete_record(self):
        self.complete()
        self.assertTrue(records.audit_record(self.directory)['passed'])

    def test_incomplete_actual_message_rejected(self):
        self.value['nativeArguments']['message']='different'
        self.assertFalse(records.validate_dispatch(self.value)['passed'])

    def test_undelivered_guidance_rejected(self):
        self.value['message']='no guidance';self.value['nativeArguments']['message']='no guidance'
        self.assertFalse(records.validate_dispatch(self.value)['passed'])

    def test_invalid_original_context_rejected(self):
        self.value['safeContext']['activeExecutions'][0]['runId']='other'
        self.assertFalse(records.validate_dispatch(self.value)['passed'])

    def test_private_or_invalid_dependency_rejected(self):
        self.value['safeContext']['dependencies'][0]['status']='stale'
        self.assertFalse(records.validate_dispatch(self.value)['passed'])

    def test_nested_dependency_body_rejected(self):
        self.value['safeContext']['dependencies'][0]['summary']='private oracle text'
        self.assertFalse(records.validate_dispatch(self.value)['passed'])

    def test_original_host_and_review_binding_required(self):
        wrong=copy.deepcopy(self.value);wrong['safeContext']['activeExecutions'][0]['executionBinding']['mode']='cli'
        self.assertFalse(records.validate_dispatch(wrong)['passed'])
        wrong=copy.deepcopy(self.value);wrong['safeContext']['activeExecutions'][0]['reviewDigest']='f'*64
        self.assertFalse(records.validate_dispatch(wrong)['passed'])

    def test_malformed_nested_fields_controlled(self):
        for field in ['dispatchId','message']:
            broken=copy.deepcopy(self.value);broken[field]=None
            self.assertFalse(records.validate_dispatch(broken)['passed'])
        broken=copy.deepcopy(self.value);broken['safeContext']['review']=None
        self.assertFalse(records.validate_dispatch(broken)['passed'])
        broken=copy.deepcopy(self.value);broken['guidanceMaterials'][0]['sourceSha256']=None
        self.assertFalse(records.validate_dispatch(broken)['passed'])
        broken=copy.deepcopy(self.value);broken['inputFiles'][0]['sha256']=None
        self.assertFalse(records.validate_dispatch(broken)['passed'])
        self.value['safeContext']['dependencies'][0]['status']='verified'
        self.value['safeContext']['files']=[{'text':'private oracle'}]
        self.assertFalse(records.validate_dispatch(self.value)['passed'])

    def test_frozen_dispatch_is_exclusive(self):
        self.freeze()
        with self.assertRaises(FileExistsError):self.freeze()

    def test_submitted_payload_must_match_frozen(self):
        self.freeze()
        wrong=copy.deepcopy(self.value['nativeArguments']);wrong['message']='wrong actual payload'
        with self.assertRaises(ValueError):
            records.append_event(self.directory,'dispatched',{'actorId':'synthetic-actor','submittedArguments':wrong,
                'argumentSource':'parent-visible-native-call'})

    def test_missing_return_not_a_checkpoint(self):
        self.freeze();self.dispatch()
        with self.assertRaises(ValueError):records.freeze_checkpoint(self.temp/'checkpoint.json',self.directory)

    def test_checkpoint_and_same_original_run_resume(self):
        self.complete()
        checkpoint=records.freeze_checkpoint(self.temp/'checkpoint.json',self.directory)
        resume={**self.value,'role':'resume','caseVersion':'v2','checkpointSha256':records.digest(records.json_bytes(checkpoint))}
        extra={'initial_directory':self.directory} if 'initial_directory' in inspect.signature(records.validate_resume).parameters else {}
        self.assertTrue(records.validate_resume(checkpoint,resume,**extra)['passed'])
        self.assertFalse(checkpoint['runtimeAccepted'])
        self.assertTrue(checkpoint['provisional'])
        self.assertFalse(records.validate_resume(checkpoint,{**resume,'parentRunId':'new-run'},**extra)['passed'])
        self.assertFalse(records.validate_resume(checkpoint,{**resume,'trialId':'W-C1'},**extra)['passed'])
        self.assertFalse(records.validate_resume(checkpoint,{**resume,'caseVersion':'v1'},**extra)['passed'])

    def test_checkpoint_source_actor_and_dispatch_bound(self):
        self.complete()
        checkpoint=records.freeze_checkpoint(self.temp/'checkpoint.json',self.directory)
        resume={**self.value,'role':'resume','caseVersion':'v2'}
        extra={'initial_directory':self.directory} if 'initial_directory' in inspect.signature(records.validate_resume).parameters else {}
        for field in ['originalActorId','sourceDispatchSha256']:
            broken={**checkpoint,field:'wrong'}
            resume['checkpointSha256']=records.digest(records.json_bytes(broken))
            self.assertFalse(records.validate_resume(broken,resume,**extra)['passed'])

    def test_actual_resume_actor_must_differ(self):
        self.complete()
        checkpoint_path=self.temp/'checkpoint.json'
        records.freeze_checkpoint(checkpoint_path,self.directory)
        resume_value={**self.value,'role':'resume','caseVersion':'v2','dispatchId':'synthetic-resume',
            'checkpointSha256':records.digest(checkpoint_path.read_bytes())}
        resume_dir=self.temp/'resume'
        records.freeze_dispatch(resume_dir,resume_value)
        records.append_event(resume_dir,'dispatched',{'actorId':'synthetic-fresh-actor',
            'submittedArguments':resume_value['nativeArguments'],'argumentSource':'parent-visible-native-call'})
        records.save_return(resume_dir,'synthetic-fresh-actor','Synthetic resumed final.\n',self.metrics)
        self.assertTrue(check_recovery(self.directory,resume_dir,checkpoint_path)['passed'])
        es=records.events(resume_dir)
        for e in es:e['details']['actorId']='synthetic-actor'
        es[-1]['previousEventSha256']=records.digest(records.json_bytes(es[0]))
        (resume_dir/'events.jsonl').write_text(''.join(json.dumps(e)+'\n' for e in es),encoding='utf-8')
        self.assertFalse(check_recovery(self.directory,resume_dir,checkpoint_path)['passed'])

    def test_missing_metric_is_not_zero(self):
        self.freeze();self.dispatch()
        self.metrics['tokens']['value']=0
        with self.assertRaises(ValueError):records.save_return(self.directory,'synthetic-actor','fixture',self.metrics)

    def test_observed_metric_must_have_value(self):
        self.freeze();self.dispatch()
        self.metrics['tokens']={'status':'observed','value':None,'source':'fixture'}
        with self.assertRaises(ValueError):records.save_return(self.directory,'synthetic-actor','fixture',self.metrics)

    def test_saved_message_drift_rejected(self):
        self.complete()
        (self.directory/'message.txt').write_text('different',encoding='utf-8')
        self.assertFalse(records.audit_record(self.directory)['passed'])

    def test_rehashed_saved_message_must_match_dispatch(self):
        self.complete()
        saved=b'Different saved message with a matching stored hash.\n'
        (self.directory/'message.txt').write_bytes(saved)
        dispatch=json.loads((self.directory/'dispatch.json').read_text(encoding='utf-8'))
        dispatch['messageSha256']=records.digest(saved)
        (self.directory/'dispatch.json').write_bytes(records.json_bytes(dispatch))
        es=records.events(self.directory)
        es[-1]['details']['messageSha256']=dispatch['messageSha256']
        (self.directory/'events.jsonl').write_bytes(''.join(json.dumps(e)+'\n' for e in es).encode('utf-8'))
        self.assertTrue(records.validate_dispatch(dispatch)['passed'])
        self.assertEqual(es[0]['details']['submittedArguments']['message'],dispatch['message'])
        self.assertNotEqual(saved,dispatch['message'].encode('utf-8'))
        self.assertFalse(records.audit_record(self.directory)['passed'])

    def test_rehashed_saved_arguments_must_match_dispatch(self):
        self.complete()
        dispatch=json.loads((self.directory/'dispatch.json').read_text(encoding='utf-8'))
        arguments=copy.deepcopy(dispatch['nativeArguments'])
        arguments['task_name']='different_saved_actor'
        saved=records.json_bytes(arguments)
        (self.directory/'native-arguments.json').write_bytes(saved)
        dispatch['nativeArgumentsSha256']=records.digest(saved)
        (self.directory/'dispatch.json').write_bytes(records.json_bytes(dispatch))
        self.assertTrue(records.validate_dispatch(dispatch)['passed'])
        self.assertEqual(records.events(self.directory)[0]['details']['submittedArguments'],dispatch['nativeArguments'])
        self.assertNotEqual(arguments,dispatch['nativeArguments'])
        self.assertFalse(records.audit_record(self.directory)['passed'])

    def test_metric_record_drift_rejected(self):
        self.complete()
        (self.directory/'metrics.json').write_text('{}',encoding='utf-8')
        self.assertFalse(records.audit_record(self.directory)['passed'])

    def test_return_message_binding_rechecked(self):
        self.complete()
        es=records.events(self.directory);es[-1]['details']['messageSha256']='f'*64
        (self.directory/'events.jsonl').write_text(''.join(json.dumps(e)+'\n' for e in es),encoding='utf-8')
        self.assertFalse(records.audit_record(self.directory)['passed'])

    def test_self_consistent_bad_metric_schema_rejected(self):
        self.complete()
        metrics=copy.deepcopy(self.metrics);metrics['tokens']['value']=0
        raw=records.json_bytes(metrics)
        (self.directory/'metrics.json').write_bytes(raw)
        es=records.events(self.directory);es[-1]['details']['metricsSha256']=records.digest(raw)
        (self.directory/'events.jsonl').write_text(''.join(json.dumps(e)+'\n' for e in es),encoding='utf-8')
        self.assertFalse(records.audit_record(self.directory)['passed'])

    def test_event_sequence_drift_rejected(self):
        self.complete()
        es=records.events(self.directory);es[-1]['sequence']=99
        (self.directory/'events.jsonl').write_text(''.join(json.dumps(e)+'\n' for e in es),encoding='utf-8')
        self.assertFalse(records.audit_record(self.directory)['passed'])

    def test_scene_scaling_and_wrong_result(self):
        oracle={'coefficients':['1','2'],'sse':'3','rSquared':'0.5'}
        record={'coefficients':[1000.0,2000.0],'sse':3000000.0,'rSquared':0.5}
        tolerance={'atol':1e-10,'rtol':1e-10}
        self.assertTrue(assess_scenario('D','single',record,oracle,tolerance,factor=1000)['passed'])
        self.assertFalse(assess_scenario('D','single',{**record,'sse':3.0},oracle,tolerance,factor=1000)['passed'])
        self.assertFalse(assess_scenario('D','single',{**record,'coefficients':None},oracle,tolerance,factor=1000)['passed'])

    def test_source_copy_and_exact_map_bound(self):
        canonical=[['1','10'],['2','20'],['3','30']]
        rows=[['1','20'],['2','10'],['3','30']]
        original=[{'sourceLine':101},{'sourceLine':102},{'sourceLine':103}]
        mapping=[{'csvLine':2,'ySourceLine':101,'xSourceLine':102},
                 {'csvLine':3,'ySourceLine':102,'xSourceLine':101},
                 {'csvLine':4,'ySourceLine':103,'xSourceLine':103}]
        check=lambda source,m:check_source_mapping(rows,source,m,m,canonical,original,'W','v2',[0,1])['passed']
        self.assertTrue(check(canonical,mapping))
        wrong=copy.deepcopy(mapping);wrong[0]['xSourceLine']=999
        self.assertFalse(check(canonical,wrong))  # Still two mismatches; exact provenance matters.
        changed=copy.deepcopy(canonical);changed[2][0]='99'
        self.assertFalse(check(changed,mapping))

if __name__=='__main__':unittest.main(verbosity=2)
