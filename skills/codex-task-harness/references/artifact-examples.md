# Ordinary files and real archives: production, acceptance and consumption

Read when bundling code/data or resolving parent-directory/member overlaps. Schema1 outputs are ordinary files; directories organize. Declare necessary loose members individually or one real archive. A README/index/manifest binds only itself.

These executable examples are SYNTHETIC: raw.json=[1,2,3], factor=2 must produce 3 prepared rows and summary sum=12. They are not observations, and synthetic approvals are not human authorization.

## Individual files

| Task | Prerequisites | Declared outputs | Acceptance |
| --- | --- | --- | --- |
| code | none | prepare-code→code/prepare.mjs; analysis-code→code/analyze.mjs; analysis-config→config/analysis.json | Exact module/config content and loadable entries |
| data | code | clean-data→data/clean.csv | Accepted code/config creates every correct row |
| analysis | code,data | analysis-result→results/summary.json | Accepted inputs/programs yield actual sum=12 |

Code is produced/verified before first data consumption; analysis consumes verified code/data. Directories are not outputs and each necessary file has one owner.

## Real archive

Code may instead own code-bundle→packages/code.zip with required code/prepare.mjs, code/analyze.mjs and config/analysis.json members. Produce/accept it before data, not only in later analysis/final packaging. Acceptance checks complete unique members, bytes and executable entries. Consumers check accepted archive members and extract only controlled named files into isolation, not uncontrolled extractall. Existence/hash alone is insufficient.

Final code/data/results packaging can follow accepted producers, but does not replace early artifact production.

## Executable route

Permanent regressions create complete contracts/stages, use actual refs/prepare-review, begin→real programs/data→submit→verify, check outputs and stale downstream behavior after member/archive drift:

```text
node <skill>/scripts/tests/harness-regression.mjs --work-root <authorized-new-absolute-test-directory> --case-prefix artifact-
```

Use actual paths quoted for the shell. This writes isolated SYNTHETIC data, runs local Node and existing Python standard-library zipfile, without network access, model calls or dependency installation. See [regressions](../scripts/tests/harness-regression.mjs) and [helper](../scripts/tests/helpers/artifact-example.mjs); actual contracts/logs remain in returned fixtureRoot.

Both positive modes must pass. Missing executable ZIP members fail acceptance and block data. Existing directory outputs reject review; planned files later created as directories reject acceptance. For real work bind every output's ID/producer/first use/substantive checks; copying example names or numbers is not delivery.
