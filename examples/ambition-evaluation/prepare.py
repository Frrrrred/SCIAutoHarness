"""Acquire/parse fixed NIST inputs without altering observations or exposing the oracle."""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import urllib.request

HERE = Path(__file__).resolve().parent
NUMBER = r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def write_identical_or_new(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != data:
            raise FileExistsError(f'Refuse to overwrite differing material: {path}')
    else:
        with path.open('xb') as f:
            f.write(data)

def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode('utf-8')

def parse_case(data, case):
    text = data.decode('ascii')
    if digest(text.encode('utf-8')) != case['decodedTextSha256']:
        raise ValueError('Decoded source identity changed: ' + case['name'])
    lines = text.splitlines()
    markers = [i for i, line in enumerate(lines) if re.match(r'^\s*Data:\s+y(?:\s|$)', line)]
    if len(markers) != 1:
        raise ValueError('Ambiguous observed-data header')
    start = markers[0]
    columns = lines[start].split(':', 1)[1].split()
    if columns != case['columns']:
        raise ValueError('Column mapping differs from approved model')
    rows, mapping = [], []
    for i in range(start + 1, len(lines)):
        if not lines[i].strip():
            continue
        tokens = lines[i].split()
        if len(tokens) != len(columns) or not all(re.fullmatch(NUMBER, t) for t in tokens):
            raise ValueError(f'Unexpected observation at original line {i + 1}')
        rows.append(tokens)
        mapping.append({'csvLine': len(rows) + 1, 'sourceLine': i + 1, 'tokens': tokens})
    if len(rows) != case['rows']:
        raise ValueError('Observation count mismatch')
    estimates = []
    for line in lines[:start]:
        m = re.match(r'^\s*B(\d+)\s+(' + NUMBER + r')\s+(' + NUMBER + r')\s*$', line)
        if m:
            estimates.append((int(m[1]), m[2]))
    if [i for i, _ in estimates] != list(range(case['parameters'])):
        raise ValueError('Certified parameter count/order mismatch')
    residual = [re.match(r'^\s*Residual\s+(\d+)\s+(' + NUMBER + r')\s+', line) for line in lines[:start]]
    residual = [m for m in residual if m]
    r_squared = re.search(r'R-Squared\s+(' + NUMBER + ')', text[:text.index(lines[start])])
    if len(residual) != 1 or int(residual[0][1]) != case['rows'] - case['parameters'] or not r_squared:
        raise ValueError('Certified residual/DOF definition mismatch')
    oracle = {'case': case['name'], 'coefficients': [v for _, v in estimates],
              'sse': residual[0][2], 'rSquared': r_squared[1],
              'residualDof': int(residual[0][1]), 'source': 'NIST certified statistics; no model-generated values'}
    csv_file = io.StringIO(newline='')
    writer = csv.writer(csv_file, lineterminator='\n')
    writer.writerow(columns)
    writer.writerows(rows)
    metadata = {'case': case['name'], 'sourceUrl': f'https://www.itl.nist.gov/div898/strd/lls/data/LINKS/DATA/{case["name"]}.dat',
                'rows': len(rows), 'columns': columns, 'parameters': case['parameters'], 'equation': case['equation'],
                'sourceDataHeaderLine': start + 1, 'rowMapping': mapping, 'observationChanges': [],
                'rawBytesSha256': digest(data), 'decodedTextSha256': digest(text.encode('utf-8')),
                'derivation': 'Extract observed table only; original decimal tokens retained; CSV is a derivative, not raw.',
                'sourceHeaderWarnings': []}
    if case['name'] == 'Longley':
        metadata['sourceHeaderWarnings'] = [
            'Original summary says Polynomial Class and B0..B7; actual displayed equation and certified list have intercept plus six predictors, seven coefficients. Original bytes retained; use equation/table/list mapping.']
    return csv_file.getvalue().encode('ascii'), metadata, oracle

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--raw-dir', type=Path)
    args = parser.parse_args()
    if not args.download and args.raw_dir is None:
        parser.error('Use explicit --download or an existing --raw-dir')
    config = json.loads((HERE / 'cases.json').read_text(encoding='utf-8'))
    root = args.out.resolve()
    index = {'schemaVersion': 1, 'producer': str(Path(__file__).resolve()),
             'producerSha256': digest(Path(__file__).read_bytes()), 'producerArgv': sys.argv,
             'runnerSha256': digest((HERE / 'run_case.py').read_bytes()),
             'checkerSha256': digest((HERE / 'check_results.py').read_bytes()),
             'configSha256': digest((HERE / 'cases.json').read_bytes()), 'cases': [],
             'notes': 'Raw observations retained; certification answers isolated; checksums do not authenticate sources.'}
    for case in config['cases']:
        url = config['sourceBase'] + case['name'] + '.dat'
        raw_path = root / 'raw' / (case['name'] + '.dat')
        provenance_path = root / 'raw' / (case['name'] + '.download.json')
        if raw_path.exists():
            data = raw_path.read_bytes()
        elif args.raw_dir is not None:
            data = (args.raw_dir / (case['name'] + '.dat')).read_bytes()
        else:
            req = urllib.request.Request(url, headers={'User-Agent': 'AgentTaskHarness-SourceBoundEvaluation/1'})
            with urllib.request.urlopen(req, timeout=30) as response:
                if response.geturl() != url:
                    raise ValueError('Unexpected download redirect: ' + response.geturl())
                data = response.read()
            write_identical_or_new(provenance_path, json_bytes({'sourceUrl': url, 'transport': 'urllib HTTPS bytes',
                'obtainedUtc': datetime.now(timezone.utc).isoformat(), 'downloadBytesSha256': digest(data)}))
        write_identical_or_new(raw_path, data)
        csv_data, metadata, oracle = parse_case(data, case)
        write_identical_or_new(root / 'inputs' / (case['name'] + '.csv'), csv_data)
        write_identical_or_new(root / 'metadata' / (case['name'] + '.json'), json_bytes(metadata))
        write_identical_or_new(root / 'oracle' / (case['name'] + '.json'), json_bytes(oracle))
        index['cases'].append({'name': case['name'], 'rows': case['rows'], 'rawBytesSha256': digest(data),
            'decodedTextSha256': metadata['decodedTextSha256'], 'inputSha256': digest(csv_data),
            'raw': str(raw_path), 'input': str(root / 'inputs' / (case['name'] + '.csv')),
            'metadata': str(root / 'metadata' / (case['name'] + '.json')),
            'metadataSha256': digest(json_bytes(metadata)),
            'oracle': str(root / 'oracle' / (case['name'] + '.json')),
            'oracleSha256': digest(json_bytes(oracle)), 'observationsUnchanged': True})
    write_identical_or_new(root / 'index.json', json_bytes(index))
    print(json.dumps({'prepared': True, 'root': str(root), 'cases': [c['name'] for c in index['cases']]}))

if __name__ == '__main__':
    main()
