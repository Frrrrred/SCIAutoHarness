"""Parent-only scenario/record checks. Actual semantic appraisal remains required."""
import argparse
import copy
import csv
import json
import math
from pathlib import Path

from check_results import check_invocation_binding
from prepare import parse_case
from trial_records import audit_record, digest, events, json_bytes, new_file, validate_resume

HERE=Path(__file__).resolve().parent

def check_source_mapping(rows,source,mapping,index_mapping,canonical_rows,canonical_mapping,scenario,version,swap):
    """Tie all cells and both map representations to the independent canonical source."""
    expected=[list(row) for row in canonical_rows]
    x_source=list(range(len(expected)))
    if scenario=='W' and version=='v2':
        i,j=swap;expected[i][1],expected[j][1]=expected[j][1],expected[i][1]
        x_source[i],x_source[j]=x_source[j],x_source[i]
    expected_mapping=[{'csvLine':i+2,'ySourceLine':canonical_mapping[i]['sourceLine'],
                       'xSourceLine':canonical_mapping[x_source[i]]['sourceLine']} for i in range(len(expected))]
    errors=[]
    if source!=canonical_rows:errors.append('source_copy_not_canonical')
    if rows!=expected:errors.append('unexpected_observation_transform')
    if mapping!=expected_mapping:errors.append('actor_mapping_not_canonical')
    if index_mapping!=expected_mapping:errors.append('index_mapping_not_canonical')
    return {'passed':not errors,'errors':errors}

def close(value,reference,tolerance):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and abs(value-float(reference))<=tolerance['atol']+tolerance['rtol']*abs(float(reference))

def assess_scenario(scenario,version,record,oracle,tolerance,*,factor=1):
    errors=[]
    if scenario=='D':
        if not close(record.get('sse'),float(oracle['sse'])*factor**2,tolerance):errors.append('derived_sse_scale')
        if not isinstance(record.get('coefficients'),list) or len(record['coefficients'])!=2:
            errors.append('coefficient_shape')
        elif not all(close(v,float(r)*factor,tolerance) for v,r in zip(record['coefficients'],oracle['coefficients'])):
            errors.append('derived_coefficient_scale')
        if not close(record.get('rSquared'),oracle['rSquared'],tolerance):errors.append('r_squared_invariance')
    elif scenario=='W' and version=='v1':
        if not close(record.get('sse'),oracle['sse'],tolerance):errors.append('healthy_sse')
        if not isinstance(record.get('coefficients'),list) or len(record['coefficients'])!=2 or not all(close(v,r,tolerance) for v,r in zip(record['coefficients'],oracle['coefficients'])):
            errors.append('healthy_coefficients')
    elif scenario=='W' and version=='v2':
        # This input has an intentional provenance fault; do not award NIST agreement.
        if not isinstance(record.get('sse'),(int,float)) or not math.isfinite(record['sse']):errors.append('nonfinite_fixture')
    else:errors.append('scenario_version')
    return {'passed':not errors,'errors':errors,'scope':'Engineering scene computation only; scientific decision needs actual source/meaning appraisal.'}

def binding_for(view,source_index_sha,trial_id):
    return {'bindingVersion':1,'trialId':trial_id,'case':'Norris','method':'stable',
        'sourceIndexSha256':source_index_sha,'executionRoot':view['path'],'cwd':'.',
        'runner':'analysis.py','data':'observations.csv','runnerSha256':view['members']['analysis.py'],
        'inputSha256':view['members']['observations.csv']}

def check_recovery(initial_directory,resume_directory,checkpoint_path):
    initial_directory,resume_directory=Path(initial_directory),Path(resume_directory)
    initial=audit_record(initial_directory);resumed=audit_record(resume_directory)
    if not initial['passed'] or not resumed['passed']:
        return {'passed':False,'errors':['initial_or_resume_record_invalid'],'initial':initial,'resume':resumed}
    checkpoint=json.loads(Path(checkpoint_path).read_text(encoding='utf-8'))
    dispatch=json.loads((resume_directory/'dispatch.json').read_text(encoding='utf-8'))
    check=validate_resume(checkpoint,dispatch,initial_directory=initial_directory)
    first_actor=events(initial_directory)[0]['details']['actorId']
    second_actor=events(resume_directory)[0]['details']['actorId']
    if first_actor==second_actor:check['errors'].append('resume_actor_not_fresh')
    if dispatch.get('checkpointSha256')!=digest(Path(checkpoint_path).read_bytes()):check['errors'].append('actual_checkpoint_file_identity')
    check.update({'passed':not check['errors'],'initialActor':first_actor,'resumeActor':second_actor,
        'parentRunId':dispatch['parentRunId'],'trialId':dispatch['trialId'],
        'scope':'Actual recorded fresh-context/same-parent-run chain only; source and scientific decision still require substantive appraisal.'})
    return check

def health(index_path):
    index_path=Path(index_path)
    root=index_path.parent
    index=json.loads(index_path.read_text(encoding='utf-8'))
    index_sha=digest(index_path.read_bytes())
    identity_errors=[name for name,h in index['members'].items() if digest((root/name).read_bytes())!=h]
    actual_members={p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()}
    if actual_members!=set(index['members'])|{'index.json'}:identity_errors.append('case_membership_drift')
    if any(digest((HERE/n).read_bytes())!=h for n,h in index['toolHashes'].items()):identity_errors.append('toolchain_drift')
    canonical=root/'canonical'
    if digest((canonical/'index.json').read_bytes())!=index['canonicalIndexSha256']:identity_errors.append('canonical_index_drift')
    canonical_config=json.loads((HERE/'cases.json').read_text(encoding='utf-8'))
    source_case=next(c for c in canonical_config['cases'] if c['name']=='Norris')
    canonical_csv,canonical_metadata,certified=parse_case((canonical/'raw/Norris.dat').read_bytes(),source_case)
    if (canonical/'inputs/Norris.csv').read_bytes()!=canonical_csv:identity_errors.append('canonical_input_not_raw')
    saved_metadata=json.loads((canonical/'metadata/Norris.json').read_text(encoding='utf-8'))
    if saved_metadata!=canonical_metadata:identity_errors.append('canonical_metadata_not_raw')
    canonical_rows=list(csv.reader(canonical_csv.decode('ascii').splitlines()))[1:]
    oracle=json.loads((root/'oracle/scenarios.json').read_text(encoding='utf-8'))['originalNorris']
    if oracle!=certified:identity_errors.append('canonical_oracle_not_raw')
    tolerance=index['config']['tolerance']
    results=[]
    for key,view in index['views'].items():
        directory=Path(view['path'])
        record=json.loads((directory/'export.json').read_text(encoding='utf-8'))
        strict=check_invocation_binding(record,binding_for(view,index_sha,key),directory,
            expected_index=index_sha,expected_trial_id=key)
        scene=assess_scenario(view['scenario'],view['version'],record,oracle,tolerance,
                              factor=index['config']['dResponseFactor'] if view['scenario']=='D' else 1)
        with (directory/'observations.csv').open(newline='',encoding='ascii') as f:rows=list(csv.reader(f))[1:]
        with (directory/'source_observations.csv').open(newline='',encoding='ascii') as f:source=list(csv.reader(f))[1:]
        actor_metadata=json.loads((directory/'metadata.json').read_text(encoding='utf-8'))
        mapped=check_source_mapping(rows,source,actor_metadata['rowMapping'],view['rowSourceMapping'],
            canonical_rows,canonical_metadata['rowMapping'],view['scenario'],view['version'],index['config']['wSwapXRows'])
        metadata_ok=(actor_metadata.get('case')=='Norris' and actor_metadata.get('version')==view['version']
            and actor_metadata.get('rows')==36 and actor_metadata.get('columns')==['y','x']
            and actor_metadata.get('sourceUrl')==canonical_metadata['sourceUrl'])
        results.append({'id':key,'binding':strict,'scene':scene,'sourceMapping':mapped,'metadataIdentity':metadata_ok,
                        'passed':strict['bindingPass'] and scene['passed'] and mapped['passed'] and metadata_ok})
    tests=[]
    good=copy.deepcopy(json.loads((Path(index['views']['D-C0']['path'])/'export.json').read_text(encoding='utf-8')))
    for name,change in [('valid',None),('wrong-sse','sse'),('missing-coefficients','coefficients'),('wrong-rSquared','rSquared')]:
        record=copy.deepcopy(good)
        if change=='coefficients':record.pop(change)
        elif change:record[change]=float(record[change])*2
        result=assess_scenario('D','single',record,oracle,tolerance,factor=index['config']['dResponseFactor'])
        tests.append({'id':name,'expected':name=='valid','actual':result['passed']})
    return {'passed':not identity_errors and all(r['passed'] for r in results) and all(t['actual']==t['expected'] for t in tests),
        'caseIndexSha256':index_sha,'identityErrors':identity_errors,'views':results,'syntheticScorerChecks':tests,
        'modelCalls':0,'limitations':'Case health and record consistency only, not model behavior or semantic acceptance.'}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    modes=p.add_mutually_exclusive_group(required=True)
    modes.add_argument('--health',type=Path,metavar='CASE_INDEX')
    modes.add_argument('--record',type=Path,metavar='RECORD_DIRECTORY')
    modes.add_argument('--recovery',type=Path,metavar='INITIAL_RECORD_DIRECTORY')
    p.add_argument('--resume-record',type=Path)
    p.add_argument('--checkpoint',type=Path)
    p.add_argument('--output',type=Path,required=True)
    a=p.parse_args()
    if a.recovery and not (a.resume_record and a.checkpoint):p.error('--recovery needs --resume-record and --checkpoint')
    result=health(a.health) if a.health else check_recovery(a.recovery,a.resume_record,a.checkpoint) if a.recovery else audit_record(a.record)
    new_file(a.output,json_bytes(result))
    print(json.dumps({'passed':result['passed'],'output':str(a.output)}))
    return 0 if result['passed'] else 1

if __name__=='__main__':raise SystemExit(main())
