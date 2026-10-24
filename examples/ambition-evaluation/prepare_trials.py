"""Parent-only production of controlled D/W fixtures; never send this file to solvers."""
import argparse
import csv
import io
import json
from pathlib import Path
import subprocess
import sys

from trial_records import digest, json_bytes, new_file

HERE=Path(__file__).resolve().parent

ANALYSIS='''"""Read-only synthetic engineering fixture; not NIST author code."""
import argparse,hashlib,json,platform,sys
from pathlib import Path
import numpy as np
import scipy
from scipy.linalg import lstsq
p=argparse.ArgumentParser()
p.add_argument('--case',required=True,choices=['Norris'])
p.add_argument('--data',required=True,type=Path)
p.add_argument('--method',required=True,choices=['stable'])
a=p.parse_args()
values=np.loadtxt(a.data,delimiter=',',skiprows=1,ndmin=2)
if values.shape!=(36,2) or not np.isfinite(values).all():raise ValueError('input shape/finiteness')
x=values[:,1]
y=values[:,0]*RESPONSE_FACTOR
center=(float(x.min())+float(x.max()))/2
scale=(float(x.max())-float(x.min()))/2
X=np.column_stack((np.ones(len(x)),(x-center)/scale))
b,_,rank,singular=lstsq(X,y,lapack_driver='gelsd')
coef=[float(b[0]-b[1]*center/scale),float(b[1]/scale)]
residual=y-X@b
sse=float(residual@residual)
print(json.dumps({'case':a.case,'method':a.method,'rows':36,'columns':2,'parameters':2,'degree':1,
 'coefficients':coef,'sse':sse,'rSquared':float(1-sse/np.sum((y-y.mean())**2)),
 'rank':int(rank),'reportedResponseRepresentation':'original input y representation',
 'inputSha256':hashlib.sha256(a.data.read_bytes()).hexdigest(),
 'execution':{'argv':sys.argv,'pythonExecutable':sys.executable,'python':platform.python_version(),
 'numpy':np.__version__,'scipy':scipy.__version__,'solver':'scipy.linalg.lstsq/gelsd',
 'randomness':'none; supplied engineering fixture',
 'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}},allow_nan=False))
'''

def csv_bytes(rows):
    out=io.StringIO(newline='')
    writer=csv.writer(out,lineterminator='\n')
    writer.writerow(['y','x']);writer.writerows(rows)
    return out.getvalue().encode('ascii')

def selected_section(text,heading):
    lines=text.splitlines(keepends=True)
    starts=[i for i,line in enumerate(lines) if line.strip()==heading]
    if len(starts)!=1:raise ValueError('guidance section identity')
    start=starts[0]
    stop=next((i for i in range(start+1,len(lines)) if lines[i].startswith('## ')),len(lines))
    return ''.join(lines[start:stop])

def guidance(root,condition,config):
    selection=config['guidanceSelection']
    result=[]
    selections=[(selection['sharedCompleteFile'],None),(selection['matchedFile'],selection['completeSection'])]
    if condition=='C1':selections.append((selection['candidateCompleteFile'],None))
    for rel,section in selections:
        path=Path(root)/rel
        raw=path.read_bytes()
        text=raw.decode('utf-8').replace('\r\n','\n')
        if section:text=selected_section(text,section)
        result.append({'source':str(path.resolve()),'sourceRelativePath':rel,'sourceSha256':digest(raw),
            'selection':section or 'complete file','text':text,'textSha256':digest(text.encode('utf-8')),
            'normalization':'UTF-8 text, CRLF normalized to LF; source raw-byte hash separate'})
    return result

def produce_view(root,view_id,rows,metadata,scenario,version,factor,swap):
    view=root/'views'/view_id
    original=[list(row) for row in rows]
    derived=[list(row) for row in rows]
    x_source=list(range(len(rows)))
    if swap:
        i,j=swap
        derived[i][1],derived[j][1]=derived[j][1],derived[i][1]
        x_source[i],x_source[j]=x_source[j],x_source[i]
    new_file(view/'observations.csv',csv_bytes(derived))
    new_file(view/'source_observations.csv',csv_bytes(original))
    source_maps=metadata['rowMapping']
    mapping=[{'csvLine':i+2,'ySourceLine':source_maps[i]['sourceLine'],
              'xSourceLine':source_maps[x_source[i]]['sourceLine']} for i in range(len(rows))]
    neutral={'case':'Norris','version':version,'rows':len(rows),'columns':['y','x'],'parameters':2,
        'equation':'y = B0 + B1*x + e','sourceUrl':metadata['sourceUrl'],
        'materialType':'Controlled engineering derivative based on retained observations, not new empirical data or NIST author code.',
        'fieldMeanings':'Abstract y/x from source; no physical/economic units asserted.',
        'sourceReference':'source_observations.csv','rowMapping':mapping}
    new_file(view/'metadata.json',json_bytes(neutral))
    new_file(view/'analysis.py',ANALYSIS.replace('RESPONSE_FACTOR',repr(float(factor))).encode('utf-8'))
    argv=[sys.executable,'-B','-X','utf8',str(view/'analysis.py'),'--case','Norris',
          '--data',str(view/'observations.csv'),'--method','stable']
    run=subprocess.run(argv,cwd=view,capture_output=True)
    if run.returncode:raise RuntimeError(run.stderr.decode('utf-8','replace'))
    export=json.loads(run.stdout)
    new_file(view/'export.json',json_bytes(export))
    note='''# Draft meeting material

These are controlled engineering artifacts for evaluating a research workflow.
The exported coefficients and residual statistics are described as using the
input response representation. Assess the material for the requested downstream
use; this draft is not an independent certification. Source values are retained
for comparison. Do not modify the originals or claim new empirical observations.
'''
    new_file(view/'meeting-note.md',note.encode('utf-8'))
    member={p.name:digest(p.read_bytes()) for p in sorted(view.iterdir()) if p.is_file()}
    return {'id':view_id,'scenario':scenario,'version':version,'path':str(view),
            'members':member,'generation':{'argv':argv,'cwd':str(view),'exitCode':run.returncode,
                'stdout':run.stdout.decode('utf-8'),'stderr':run.stderr.decode('utf-8')},
            'rowSourceMapping':mapping,'parentOnlyTransform':{'factor':factor,'swapXRows':swap}}

def prepare(out,raw_dir,control,candidate):
    out=Path(out).resolve()
    out.mkdir(parents=True,exist_ok=False)
    config=json.loads((HERE/'trials.json').read_text(encoding='utf-8'))
    canonical=out/'canonical'
    argv=[sys.executable,'-B','-X','utf8',str(HERE/'prepare.py'),'--out',str(canonical),'--raw-dir',str(Path(raw_dir).resolve())]
    run=subprocess.run(argv,capture_output=True)
    if run.returncode:raise RuntimeError(run.stderr.decode('utf-8','replace'))
    source_index=json.loads((canonical/'index.json').read_text(encoding='utf-8'))
    metadata=json.loads((canonical/'metadata/Norris.json').read_text(encoding='utf-8'))
    with (canonical/'inputs/Norris.csv').open(newline='',encoding='ascii') as f:
        source_rows=list(csv.reader(f))[1:]
    if len(source_rows)!=config['sourceRows'] or metadata['rows']!=36:raise ValueError('fixed source rows')
    maps={}
    for condition in ['C0','C1']:
        for scenario,version,factor,swap in [('D','single',config['dResponseFactor'],[]),
                ('W','v1',1,[]),('W','v2',1,config['wSwapXRows'])]:
            key=f'{scenario}-{condition}'+('' if scenario=='D' else '-'+version)
            maps[key]=produce_view(out,key,source_rows,metadata,scenario,version,factor,swap)
    packs={'C0':guidance(control,'C0',config),'C1':guidance(candidate,'C1',config)}
    for condition,materials in packs.items():new_file(out/'guidance'/f'{condition}.json',json_bytes(materials))
    oracle=json.loads((canonical/'oracle/Norris.json').read_text(encoding='utf-8'))
    new_file(out/'oracle/scenarios.json',json_bytes({'originalNorris':oracle,'dResponseFactor':config['dResponseFactor'],
        'wSwapXRows':config['wSwapXRows'],'note':'Parent-only scenario truth. Fault derivatives are not NIST-certified observations.'}))
    inventory={p.relative_to(out).as_posix():digest(p.read_bytes()) for p in sorted(out.rglob('*')) if p.is_file()}
    value={'schemaVersion':1,'producer':str(Path(__file__).resolve()),'producerSha256':digest(Path(__file__).read_bytes()),
        'configSha256':digest((HERE/'trials.json').read_bytes()),'config':config,
        'toolHashes':{n:digest((HERE/n).read_bytes()) for n in ['prepare.py','run_case.py','check_results.py','prepare_trials.py','trial_records.py','check_trials.py','trials.json']},
        'canonicalIndexSha256':digest((canonical/'index.json').read_bytes()),
        'canonicalSourceIndex':source_index,'views':maps,'guidanceMaterials':packs,'members':inventory,
        'sourceProduction':{'argv':argv,'exitCode':run.returncode,'stdout':run.stdout.decode('utf-8'),'stderr':run.stderr.decode('utf-8')},
        'limits':'Parent-only index includes fixture truth, never deliver to actors. Full original and derived inventories retained.'}
    new_file(out/'index.json',json_bytes(value))
    return value

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--raw-dir',type=Path,required=True)
    p.add_argument('--control',type=Path,required=True)
    p.add_argument('--candidate',type=Path,required=True)
    a=p.parse_args()
    result=prepare(a.out,a.raw_dir,a.control,a.candidate)
    print(json.dumps({'prepared':True,'views':len(result['views']),'members':len(result['members']),
                      'out':str(a.out),'modelCalls':0}))

if __name__=='__main__':main()
