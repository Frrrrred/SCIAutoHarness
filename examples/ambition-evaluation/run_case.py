"""Read-only numeric runner; never reads certification answers or writes results."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import sys

import numpy as np
from numpy.polynomial import Polynomial
import scipy
from scipy.linalg import lstsq

def run(case, data_path, method):
    data_path = Path(data_path).resolve()
    values = np.loadtxt(data_path, delimiter=',', skiprows=1, ndmin=2)
    if not np.isfinite(values).all():
        raise ValueError('Nonfinite input')
    expected = {'Norris': (36, 2, 1), 'Filip': (82, 2, 10), 'Longley': (16, 7, None)}
    rows, columns, degree = expected[case]
    if values.shape != (rows, columns):
        raise ValueError(f'Unexpected shape {values.shape}, expected {(rows, columns)}')
    y, x = values[:, 0], values[:, 1:]
    if degree is not None:
        raw_design = np.polynomial.polynomial.polyvander(x[:, 0], degree)
    else:
        raw_design = np.column_stack((np.ones(rows), x))
    center = np.zeros(x.shape[1])
    scale = np.ones(x.shape[1])
    if method == 'stable':
        if degree is not None:
            lo, hi = float(x[:, 0].min()), float(x[:, 0].max())
            center, scale = np.array([(lo + hi) / 2]), np.array([(hi - lo) / 2])
            design = np.polynomial.polynomial.polyvander((x[:, 0] - center[0]) / scale[0], degree)
        else:
            center, scale = x.mean(axis=0), x.std(axis=0)
            design = np.column_stack((np.ones(rows), (x - center) / scale))
        beta, _, rank, singular = lstsq(design, y, cond=None, lapack_driver='gelsd')
        if degree is not None:
            coefficients = Polynomial(beta, domain=[lo, hi]).convert().coef
        else:
            slopes = beta[1:] / scale
            coefficients = np.r_[beta[0] - center @ slopes, slopes]
        prediction = design @ beta
        basis = 'scaled polynomial basis' if degree is not None else 'centered/scaled predictors'
    else:
        design = raw_design
        if method == 'normal':
            coefficients = np.linalg.solve(design.T @ design, design.T @ y)
            singular = np.linalg.svd(design, compute_uv=False)
            rank = np.linalg.matrix_rank(design)
        else:
            coefficients, _, rank, singular = lstsq(design, y, cond=None, lapack_driver='gelsd')
        prediction = design @ coefficients
        basis = 'original unscaled basis'
    residual = y - prediction
    sse = float(residual @ residual)
    if not np.isfinite(coefficients).all() or not np.isfinite(sse):
        raise ValueError('Nonfinite result')
    return {'case': case, 'method': method, 'deliberatelyFragileComparison': method == 'normal',
            'inputSha256': hashlib.sha256(data_path.read_bytes()).hexdigest(), 'rows': rows,
            'columns': columns, 'parameters': raw_design.shape[1], 'degree': degree,
            'coefficients': coefficients.tolist(), 'sse': sse,
            'rSquared': float(1 - sse / np.sum((y - y.mean()) ** 2)),
            'rank': int(rank), 'singularValues': singular.tolist(),
            'condition': float(np.linalg.cond(design)), 'originalBasisCondition': float(np.linalg.cond(raw_design)),
            'basis': basis, 'center': center.tolist(), 'scale': scale.tolist(),
            'execution': {'pythonExecutable': sys.executable, 'python': platform.python_version(),
                          'scriptSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                          'numpy': np.__version__, 'scipy': scipy.__version__, 'argv': sys.argv,
                          'solver': 'scipy.linalg.lstsq/gelsd' if method != 'normal' else 'numpy.linalg.solve(X.T@X,X.T@y)',
                          'randomness': 'none; deterministic supplied observations'},
            'limitations': 'Numeric computation record; interpretation requires actual evidence appraisal.'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', required=True, choices=['Norris', 'Filip', 'Longley'])
    parser.add_argument('--data', type=Path, required=True)
    parser.add_argument('--method', choices=['stable', 'raw', 'normal'], default='stable')
    args = parser.parse_args()
    print(json.dumps(run(args.case, args.data, args.method), allow_nan=False))

if __name__ == '__main__':
    main()
