"""Parent-only numeric checks and explicit synthetic scorer self-tests."""
import argparse
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import stat
import subprocess
import sys

HERE = Path(__file__).resolve().parent

def checked_local_path(root, value, *, directory=False, reader=None):
    """Validate every component before any content read; no concurrent-relink claim."""
    root = Path(root)
    if not root.is_absolute():
        raise ValueError('execution_root_not_absolute')
    root = Path(os.path.abspath(root))
    path = Path(value)
    if '..' in path.parts:
        raise ValueError('parent_traversal')
    path = Path(os.path.abspath(path if path.is_absolute() else root / path))
    if not path.is_relative_to(root):
        raise ValueError('outside_execution_root')
    # Check trusted-root ancestors too: a lexical root must not conceal a junction.
    chain = [path, *path.parents]
    for component in reversed(chain):
        info = component.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise ValueError('link_or_reparse_component')
    if directory:
        if not path.is_dir():
            raise ValueError('not_directory')
        return path
    if not stat.S_ISREG(path.lstat().st_mode):
        raise ValueError('not_regular_file')
    if reader is None:
        return path
    return reader(path)

def check_invocation_binding(record, binding, execution_root, *, expected_index=None, expected_trial_id=None):
    """Check registered invocation consistency, never execution authentication."""
    errors = []
    try:
        root = checked_local_path(execution_root, '.', directory=True)
        if not isinstance(binding, dict) or type(binding.get('bindingVersion')) is not int or binding['bindingVersion'] != 1:
            raise ValueError('binding_schema')
        if not isinstance(binding.get('trialId'), str) or not binding['trialId'].strip():
            raise ValueError('binding_trial')
        if expected_trial_id is not None and binding['trialId'] != expected_trial_id:
            raise ValueError('trial_context_mismatch')
        if Path(binding['executionRoot']) != root:
            raise ValueError('binding_cannot_widen_root')
        if expected_index is not None and binding.get('sourceIndexSha256') != expected_index:
            raise ValueError('source_index_mismatch')
        cwd = checked_local_path(root, binding['cwd'], directory=True)
        if not isinstance(record, dict) or not isinstance(record.get('execution'), dict):
            raise ValueError('missing_execution_declaration')
        execution = record['execution']
        argv = execution.get('argv')
        if not isinstance(argv, list) or not argv or not all(isinstance(a, str) and a for a in argv):
            raise ValueError('missing_execution_argv')
        values = {}
        for flag in ['--case', '--data', '--method']:
            if argv.count(flag) != 1:
                raise ValueError('missing_or_duplicate_' + flag[2:])
            i = argv.index(flag)
            if i + 1 >= len(argv) or argv[i + 1].startswith('--'):
                raise ValueError('missing_value_' + flag[2:])
            values[flag] = argv[i + 1]
        if len(argv) != 7 or any(argv[i] not in ['--case', '--data', '--method'] for i in [1, 3, 5]):
            raise ValueError('unregistered_argument_shape')
        if values['--case'] != record.get('case') or record.get('case') != binding.get('case'):
            raise ValueError('case_binding_mismatch')
        if values['--method'] != record.get('method') or record.get('method') != binding.get('method'):
            raise ValueError('method_binding_mismatch')
        def from_cwd(value):
            p = Path(value)
            if '..' in p.parts:
                raise ValueError('parent_traversal')
            return p if p.is_absolute() else cwd / p
        bound_script = checked_local_path(root, binding['runner'])
        bound_data = checked_local_path(root, binding['data'])
        script = checked_local_path(root, from_cwd(argv[0]))
        data = checked_local_path(root, from_cwd(values['--data']))
        if script != bound_script or data != bound_data:
            raise ValueError('command_path_binding_mismatch')
        # All paths and ancestors are validated before these content reads.
        actual_script = hashlib.sha256(script.read_bytes()).hexdigest()
        actual_data = hashlib.sha256(data.read_bytes()).hexdigest()
        if actual_script != binding.get('runnerSha256') or actual_script != execution.get('scriptSha256'):
            raise ValueError('bound_runner_content_mismatch')
        if actual_data != binding.get('inputSha256') or actual_data != record.get('inputSha256'):
            raise ValueError('bound_input_content_mismatch')
    except (ValueError, KeyError, TypeError, OSError) as exc:
        errors.append(str(exc))
    return {'bindingPass': not errors, 'bindingStatus': 'bound-consistent' if not errors else 'binding-failed',
            'errors': errors, 'executionAuthentication': 'not established; registered paths/content/declarations only'}

def check(record, case, oracle, expected_input, expected_runner):
    errors = []
    if record.get('case') != case['name'] or record.get('rows') != case['rows']:
        errors.append('case_or_rows')
    if record.get('parameters') != case['parameters'] or record.get('inputSha256') != expected_input:
        errors.append('model_or_input_identity')
    if record.get('degree') != case['degree'] or record.get('columns') != len(case['columns']):
        errors.append('degree_or_columns')
    execution = record.get('execution')
    if not isinstance(execution, dict):
        errors.append('missing_execution_declaration')
    else:
        for field in ['pythonExecutable', 'python', 'numpy', 'scipy', 'solver', 'randomness']:
            if not isinstance(execution.get(field), str) or not execution[field].strip():
                errors.append('missing_execution_' + field)
        argv = execution.get('argv')
        if not isinstance(argv, list) or not argv or not all(isinstance(a, str) and a for a in argv):
            errors.append('missing_execution_argv')
        else:
            argument_values = {}
            if argv[0].startswith('-'):
                errors.append('missing_execution_script')
            for flag in ['--case', '--data', '--method']:
                if argv.count(flag) != 1:
                    errors.append('missing_or_duplicate_' + flag[2:])
                    continue
                position = argv.index(flag)
                if position + 1 >= len(argv) or argv[position + 1].startswith('--'):
                    errors.append('missing_value_' + flag[2:])
                else:
                    argument_values[flag] = argv[position + 1]
            if argument_values.get('--case') != case['name'] or argument_values.get('--method') != record.get('method'):
                errors.append('command_result_mismatch')
        expected_solver = {'stable': 'scipy.linalg.lstsq/gelsd', 'raw': 'scipy.linalg.lstsq/gelsd',
                           'normal': 'numpy.linalg.solve(X.T@X,X.T@y)'}.get(record.get('method'))
        if expected_solver is None or execution.get('solver') != expected_solver:
            errors.append('method_solver_mismatch')
        if execution.get('scriptSha256') != expected_runner:
            errors.append('runner_identity')
    tolerance = case['tolerance']
    def close(value, reference):
        return isinstance(value, (int, float)) and math.isfinite(value) and abs(value - float(reference)) <= tolerance['atol'] + tolerance['rtol'] * abs(float(reference))
    if not close(record.get('sse'), oracle['sse']):
        errors.append('sse')
    if not close(record.get('rSquared'), oracle['rSquared']):
        errors.append('r_squared')
    coefficients = record.get('coefficients')
    if not isinstance(coefficients, list) or len(coefficients) != case['parameters'] or not all(isinstance(x, (int, float)) and math.isfinite(x) for x in coefficients):
        errors.append('coefficient_shape_or_finiteness')
    elif tolerance['checkCoefficients'] and not all(close(v, r) for v, r in zip(coefficients, oracle['coefficients'])):
        errors.append('coefficients')
    claims = record.get('claims', {})
    if claims.get('causalityProvedByTrainingR2') is True or claims.get('generalizationProvedByTrainingR2') is True:
        errors.append('unsupported_claim_flags')
    return {'numericRecordPass': not errors, 'errors': errors, 'bindingStatus': 'legacy-unbound',
            'semanticAcceptance': 'requires actual evidence and reasoning appraisal; not established by this program',
            'executionAuthentication': 'not established; declarations alone are not proof of actual execution'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--reference-health', action='store_true')
    mode.add_argument('--self-test', action='store_true')
    mode.add_argument('--result', type=Path)
    parser.add_argument('--case', choices=['Norris', 'Filip', 'Longley'])
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--invocation-binding', type=Path)
    parser.add_argument('--execution-root', type=Path)
    args = parser.parse_args()
    args.root = args.root.resolve()
    if bool(args.invocation_binding) != bool(args.execution_root):
        parser.error('--invocation-binding and --execution-root must be supplied together')
    if args.invocation_binding and not args.result:
        parser.error('explicit invocation binding is for --result; reference health records known actual commands')
    config = json.loads((HERE / 'cases.json').read_text(encoding='utf-8'))
    frozen = json.loads((args.root / 'index.json').read_text(encoding='utf-8'))
    source_hashes = {
        'configSha256': hashlib.sha256((HERE / 'cases.json').read_bytes()).hexdigest(),
        'runnerSha256': hashlib.sha256((HERE / 'run_case.py').read_bytes()).hexdigest(),
        'checkerSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'indexSha256': hashlib.sha256((args.root / 'index.json').read_bytes()).hexdigest()}
    global_errors = [field for field in ['configSha256', 'runnerSha256', 'checkerSha256'] if source_hashes[field] != frozen[field]]
    frozen_cases = {c['name']: c for c in frozen['cases']}
    if set(frozen_cases) != {c['name'] for c in config['cases']}:
        global_errors.append('case_set')
    results, good = [], {}
    for case in config['cases']:
        if args.result and case['name'] != args.case:
            continue
        input_file = args.root / 'inputs' / (case['name'] + '.csv')
        bound = frozen_cases.get(case['name'], {})
        expected_input = bound.get('inputSha256')
        actual_input = hashlib.sha256(input_file.read_bytes()).hexdigest()
        oracle_path = args.root / 'oracle' / (case['name'] + '.json')
        oracle_bytes = oracle_path.read_bytes()
        metadata_bytes = (args.root / 'metadata' / (case['name'] + '.json')).read_bytes()
        identity_errors = list(global_errors)
        if actual_input != expected_input:
            identity_errors.append('frozen_input_drift')
        if hashlib.sha256(oracle_bytes).hexdigest() != bound.get('oracleSha256'):
            identity_errors.append('frozen_oracle_drift')
        if hashlib.sha256(metadata_bytes).hexdigest() != bound.get('metadataSha256'):
            identity_errors.append('frozen_metadata_drift')
        if identity_errors:
            results.append({'case': case['name'], 'numericRecordPass': False, 'errors': identity_errors})
            continue
        oracle = json.loads(oracle_bytes)
        if args.result:
            record = json.loads(args.result.read_text(encoding='utf-8'))
            assessed = check(record, case, oracle, expected_input, frozen['runnerSha256'])
            if args.invocation_binding:
                binding = json.loads(args.invocation_binding.read_text(encoding='utf-8'))
                strict = check_invocation_binding(record, binding, args.execution_root,
                    expected_index=source_hashes['indexSha256'])
                assessed['bindingStatus'] = strict['bindingStatus']
                assessed['bindingPass'] = strict['bindingPass']
                assessed['errors'] += strict['errors']
                assessed['numericRecordPass'] = assessed['numericRecordPass'] and strict['bindingPass']
            results.append({'case': case['name'], **assessed})
            continue
        argv = [sys.executable, str(HERE / 'run_case.py'), '--case', case['name'], '--data', str(input_file), '--method', 'stable']
        r = subprocess.run(argv, cwd=args.root, capture_output=True, text=True, check=False)
        raw = {'case': case['name'], 'command': argv, 'cwd': str(args.root), 'exit': r.returncode, 'stdout': r.stdout, 'stderr': r.stderr}
        if r.returncode:
            results.append({**raw, 'numericRecordPass': False, 'errors': ['runner_failed']})
            continue
        record = json.loads(r.stdout)
        good[case['name']] = (case, oracle, expected_input, record)
        assessed = check(record, case, oracle, expected_input, frozen['runnerSha256'])
        # The parent launches known absolute paths, which may be on different drives.
        # This receipt does not authorize a common ancestor or arbitrary record paths.
        reference_errors = []
        if record.get('execution', {}).get('argv') != argv[1:]:
            reference_errors.append('known_reference_argv_mismatch')
        strict = {'bindingPass': not reference_errors, 'errors': reference_errors,
                  'bindingStatus': 'known-reference-subprocess' if not reference_errors else 'binding-failed'}
        assessed.update({'bindingStatus': strict['bindingStatus'], 'bindingPass': strict['bindingPass']})
        assessed['errors'] += strict['errors']
        assessed['numericRecordPass'] = assessed['numericRecordPass'] and strict['bindingPass']
        results.append({**raw, **assessed})
    if args.result and not args.case:
        parser.error('--result requires --case')
    self_tests = []
    if args.self_test:
        for name, (case, oracle, identity, record) in good.items():
            assess = lambda value: check(value, case, oracle, identity, frozen['runnerSha256'])['numericRecordPass']
            self_tests.append({'id': name + '-good', 'expected': True, 'actual': assess(record)})
            wrong = copy.deepcopy(record)
            wrong['sse'] *= 2
            self_tests.append({'id': name + '-wrong-sse', 'expected': False, 'actual': assess(wrong)})
            missing = copy.deepcopy(record)
            missing.pop('execution')
            self_tests.append({'id': name + '-missing-execution', 'expected': False, 'actual': assess(missing)})
            for field in ['argv', 'solver']:
                incomplete = copy.deepcopy(record)
                incomplete['execution'].pop(field)
                self_tests.append({'id': name + '-missing-' + field, 'expected': False, 'actual': assess(incomplete)})
            wrong_input = copy.deepcopy(record)
            wrong_input['inputSha256'] = '0' * 64
            self_tests.append({'id': name + '-wrong-input', 'expected': False, 'actual': assess(wrong_input)})
            for field, value in [('degree', 99), ('columns', 99)]:
                wrong_model = copy.deepcopy(record)
                wrong_model[field] = value
                self_tests.append({'id': name + '-wrong-' + field, 'expected': False, 'actual': assess(wrong_model)})
            for defect in ['dangling-argv', 'wrong-command-case', 'wrong-command-method', 'wrong-solver']:
                invalid = copy.deepcopy(record)
                if defect == 'dangling-argv':
                    invalid['execution']['argv'] = ['--case', '--data', '--method']
                elif defect == 'wrong-command-case':
                    i = invalid['execution']['argv'].index('--case')
                    invalid['execution']['argv'][i + 1] = 'AnotherCase'
                elif defect == 'wrong-command-method':
                    i = invalid['execution']['argv'].index('--method')
                    invalid['execution']['argv'][i + 1] = 'normal'
                else:
                    invalid['execution']['solver'] = 'contradictory solver'
                self_tests.append({'id': name + '-' + defect, 'expected': False, 'actual': assess(invalid)})
        if 'Longley' in good:
            case, oracle, identity, record = good['Longley']
            overclaim = copy.deepcopy(record)
            overclaim['claims'] = {'causalityProvedByTrainingR2': True}
            self_tests.append({'id': 'Longley-explicit-overclaim', 'expected': False, 'actual': check(overclaim, case, oracle, identity, frozen['runnerSha256'])['numericRecordPass']})
    passed = len(results) == (1 if args.result else 3) and all(r['numericRecordPass'] for r in results)
    passed = passed and all(t['actual'] == t['expected'] for t in self_tests)
    if args.self_test:
        passed = passed and len(self_tests) == 37
    output = {'mode': 'self-test' if args.self_test else 'result' if args.result else 'reference-health',
              'passed': passed, 'results': results, 'syntheticSelfTests': self_tests, 'sourceHashes': source_hashes,
              'limitations': 'Numbers/declarations/explicit flags only. Not a prose judge, execution authenticator, or proof of scientific validity.'}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8') as f:
        json.dump(output, f, indent=2)
        f.write('\n')
    print(json.dumps({'passed': passed, 'cases': len(results), 'syntheticSelfTests': len(self_tests), 'output': str(args.output)}))
    return 0 if passed else 1

if __name__ == '__main__':
    raise SystemExit(main())
