"""Synthetic contract fixtures; no research observations or model execution."""
import copy
import hashlib
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock

HERE=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('example_checker',HERE/'check_results.py')
checker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)

def digest(data):return hashlib.sha256(data).hexdigest()

class InvocationBindingTests(unittest.TestCase):
    def setUp(self):
        self.work=Path(os.environ['EVIDENCE_TEST_ROOT']).resolve(strict=True)
        self.temp=Path(tempfile.mkdtemp(prefix='binding-',dir=self.work))
        self.assertTrue(self.temp.resolve().is_relative_to(self.work))
        self.addCleanup(self.cleanup)
        self.view=self.temp/'view'
        self.view.mkdir()
        (self.view/'runner.py').write_bytes(b"print('synthetic fixture')\n")
        (self.view/'observations.csv').write_bytes(b'y,x\n1,1\n2,2\n3,3\n')
        self.binding={'bindingVersion':1,'trialId':'synthetic-01','case':'Synthetic','method':'stable',
            'sourceIndexSha256':'a'*64,'executionRoot':str(self.view),'cwd':'.',
            'runner':'runner.py','data':'observations.csv',
            'runnerSha256':digest((self.view/'runner.py').read_bytes()),
            'inputSha256':digest((self.view/'observations.csv').read_bytes())}
        self.record={'case':'Synthetic','method':'stable','rows':3,'columns':2,'parameters':2,'degree':1,
            'inputSha256':self.binding['inputSha256'],'coefficients':[1.0,2.0],'sse':2.0,'rSquared':0.5,
            'execution':{'pythonExecutable':'synthetic-python','python':'fixture','numpy':'fixture','scipy':'fixture',
                'randomness':'none','solver':'scipy.linalg.lstsq/gelsd','scriptSha256':self.binding['runnerSha256'],
                'argv':['runner.py','--case','Synthetic','--data','observations.csv','--method','stable']}}
        self.case={'name':'Synthetic','rows':3,'parameters':2,'degree':1,'columns':['y','x'],
                   'tolerance':{'atol':0,'rtol':0,'checkCoefficients':True}}
        self.oracle={'coefficients':[1.0,2.0],'sse':2.0,'rSquared':0.5}

    def cleanup(self):
        if self.temp.exists():
            if not self.temp.resolve().is_relative_to(self.work):
                raise RuntimeError('Refuse cleanup outside explicit test root')
            shutil.rmtree(self.temp)

    def assess(self,record=None,binding=None,root=None,**kwargs):
        record=self.record if record is None else record
        binding=self.binding if binding is None else binding
        # The pre-change adapter demonstrates the old checker's actual false accepts.
        if not hasattr(checker,'check_invocation_binding'):
            return checker.check(record,self.case,self.oracle,self.binding['inputSha256'],self.binding['runnerSha256'])['numericRecordPass']
        return checker.check_invocation_binding(record,binding,self.view if root is None else root,
            expected_index='a'*64,**kwargs)['bindingPass']

    def test_valid_bound_paths(self):self.assertTrue(self.assess())

    def test_wrong_data_path_rejected(self):
        (self.view/'other.csv').write_bytes(b'y,x\n8,1\n9,2\n10,3\n')
        self.record['execution']['argv'][4]='other.csv'
        self.assertFalse(self.assess())

    def test_wrong_script_path_rejected(self):
        (self.view/'other.py').write_bytes(b"print('other')\n")
        self.record['execution']['argv'][0]='other.py'
        self.assertFalse(self.assess())

    def test_authorized_identical_copy(self):
        other=self.temp/'copy'
        shutil.copytree(self.view,other)
        binding={**self.binding,'executionRoot':str(other),'trialId':'synthetic-copy'}
        self.assertTrue(self.assess(binding=binding,root=other))

    def test_input_drift_rejected(self):
        (self.view/'observations.csv').write_bytes(b'drift')
        self.assertFalse(self.assess())

    def test_script_drift_rejected(self):
        (self.view/'runner.py').write_bytes(b'changed')
        self.assertFalse(self.assess())

    def test_external_samebytes_not_read(self):
        outside=self.temp/'sentinel.csv'
        outside.write_bytes((self.view/'observations.csv').read_bytes())
        self.record['execution']['argv'][4]=str(outside)
        reads=[]
        original=Path.read_bytes
        def observe(path):
            reads.append(path)
            return original(path)
        with mock.patch.object(Path,'read_bytes',observe):
            result=self.assess()
        self.assertFalse(result)
        self.assertNotIn(outside,reads)

    def test_manifest_cannot_widen_cli_root(self):
        binding={**self.binding,'executionRoot':str(self.temp),'data':'view/observations.csv','runner':'view/runner.py'}
        self.assertFalse(self.assess(binding=binding))

    def test_parent_traversal_rejected(self):
        self.record['execution']['argv'][4]='../view/observations.csv'
        self.assertFalse(self.assess())

    def test_cwd_escape_rejected(self):
        self.assertFalse(self.assess(binding={**self.binding,'cwd':'..'}))

    def test_missing_or_directory_rejected(self):
        self.record['execution']['argv'][4]='missing.csv'
        self.assertFalse(self.assess())
        self.record['execution']['argv'][4]='.'
        self.assertFalse(self.assess())

    def test_index_mismatch_rejected(self):
        self.assertFalse(self.assess(binding={**self.binding,'sourceIndexSha256':'b'*64}))

    def test_explicit_trial_context_mismatch_rejected(self):
        self.assertFalse(self.assess(expected_trial_id='another-trial'))

    def test_duplicate_flag_rejected(self):
        self.record['execution']['argv']+=['--data','observations.csv']
        self.assertFalse(self.assess())

    def test_equals_form_override_rejected(self):
        self.record['execution']['argv']+=['--case=Other']
        self.assertFalse(self.assess())

    def test_unknown_trailing_option_rejected(self):
        self.record['execution']['argv']+=['--unexpected','value']
        self.assertFalse(self.assess())

    def test_malformed_execution_returns_controlled_failure(self):
        for invalid in [None, [], 'invalid']:
            self.record['execution']=invalid
            self.assertFalse(self.assess())

    def test_wrong_case_and_method_rejected(self):
        self.assertFalse(self.assess(binding={**self.binding,'case':'Other'}))
        self.assertFalse(self.assess(binding={**self.binding,'method':'raw'}))

    def test_reparse_component_no_content_read(self):
        outside=self.temp/'outside'
        outside.mkdir()
        (outside/'secret.csv').write_bytes(b'synthetic outside sentinel')
        link=self.view/'link'
        if os.name=='nt':
            command=['cmd','/c','mklink','/J',str(link),str(outside)]
            p=subprocess.run(command,capture_output=True)
            self.assertEqual(p.returncode,0,p.stderr.decode('utf-8','replace'))
        else:
            link.symlink_to(outside,target_is_directory=True)
        self.binding['data']='link/secret.csv'
        self.record['execution']['argv'][4]='link/secret.csv'
        reads=[]
        original=Path.read_bytes
        def observe(path):
            reads.append(str(path))
            return original(path)
        with mock.patch.object(Path,'read_bytes',observe):result=self.assess()
        self.assertFalse(result)
        self.assertFalse(any('secret.csv' in n for n in reads))

    def test_legacy_numeric_scope_explicit(self):
        result=checker.check(self.record,self.case,self.oracle,self.binding['inputSha256'],self.binding['runnerSha256'])
        self.assertTrue(result['numericRecordPass'])
        self.assertEqual(result.get('bindingStatus'),'legacy-unbound')

if __name__=='__main__':unittest.main(verbosity=2)
