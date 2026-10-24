# Validation record

[README](../README.md) · [Compatibility](COMPATIBILITY.md) · [Contributing and reruns](../CONTRIBUTING.md)

Local validation completed on 2026-10-24 (Asia/Shanghai). This page records actual local evidence. The corresponding remote commit and run are checked separately through [Windows CI](https://github.com/Frrrrred/agent-task-harness/actions/workflows/validate.yml); a local pass does not establish a pass for another commit or environment.

## Actual local results

| Check | Observed result |
|---|---|
| Complete local main suite | **718/719 passed, 1 failed**, selection=all, actual exit 1; the failed flags and raw errors remain in that report |
| Focused verification | 1/1 passed for the single full-run failure, actual exit 0 via npm test on the same frozen product source; the full-run result was not rewritten |
| Combined local case coverage | All 719 distinct case IDs have a passing observed result across the full run and focused verification; this is not a claim of one clean local full run |
| Original coverage | All 532 preceding ordered IDs retained, including the original 399; 187 additional unique rename, migration and continuation guards |
| Result integrity | The full report contains 719 complete records and 719 unique nonempty IDs; its failed cases are separately accounted for |
| Fixture preparation | 3 recorded bounded setup retries; original errors and state proofs retained |
| Modules and metadata | All 21 MJS modules passed node --check; canonical and compatibility portable checks and separate upstream Python validators passed |
| Entry compatibility | The canonical skill permits implicit invocation; the six-file old-name entry is explicit-only and delegates to the same engine |
| Root wrappers | check:skill, help and help:submit passed; npm test routing is checked independently from the full direct Node invocation |
| Frozen master bytes | Complete template1/2/3 goldens unchanged; independently captured template4 rendering also passes; missing versions retain their original semantics |
| Actual pre-edit continuations | All 114 independently captured scenes continued to verified: 112 old-state scenes plus two arbitrary legacy-policy scenes; contracts, approvals, original run identities and existing receipts preserved |
| Actual old installation rollback | Eight genuine safety1/2 manifests rolled back, restoring original file bytes and identities, configuration, ACLs and NTFS streams |
| Permanent migration coverage | All three hosts, both entry names, approved/pending_acceptance/verified/active states, actual controlled CLI children, stale factual closure, shared writer gates and failure diagnostics |
| Original-object migration | Actual retired SKILL.md objects retain their identity, ACL and NTFS stream in the rollback vault and on restoration; same-byte replacement objects are refused |
| Instruction integrity | Explicit reviewedRule before/after binding, malformed/mixed/duplicate marker refusals, byte-preserved outside text and unchanged file identity |
| Strict CLI contracts | Exact argv, cwd, stdin EOF, raw exit/close and original executor; synthetic DSH terminal-output failures and publication recovery remain covered |
| Public content | Four equivalent README guides, old fragments, local links, licenses, source attribution and privacy/inventory checked; no personal rules, credentials, logs or task scenes shipped |

The local environment is Windows / Node **v26.12.1**, Python **3.14.7** and PowerShell **7.6.7**. Links, ACLs and NTFS streams were actually exercised. No npm dependency, DSH client or extra service was installed, and no real model was called for any host.

The old-state scenes were independently captured before candidate edits from the actual published runtime at [9b2532ffb6437193d6f6800a54a115ea2b6552e5](https://github.com/Frrrrred/agent-task-harness/commit/9b2532ffb6437193d6f6800a54a115ea2b6552e5). Genuine safety1 input also comes from [38d7d99dcd60b94f702d82f640b7dc4172530cfa](https://github.com/Frrrrred/agent-task-harness/commit/38d7d99dcd60b94f702d82f640b7dc4172530cfa). The main suite reconstructs those exact source files from preserved Git objects and verifies their fixed hashes; it requires a full clone. These current-baseline checks are distinct from the unperformed external-baseline upgrade suite.

Raw evidence retains earlier failed runs, including a Windows EPERM while a frozen producer prepared an unapproved master, and a second EPERM while a frozen old installer published its final synthetic setup manifest. The latter full run passed 718/719. The preparation helper now permits at most three attempts only for these precisely identified cases. Master retries require proof of a never-approved, never-executed draft. Frozen-install retries verify its prepared record and all producer target hashes, preserve the whole failed scene, and use a fresh directory. A separate controlled fault-injection probe verified that isolation. Candidate execution, rollback, production writes and fault paths are never automatically retried by these helpers.

The final local full run also reported an actual `state.json` rename EPERM from a `verify` CLI call. Its existing error-recovery path saved `verified` state, the passing acceptance report and original receipt. Independent read-only checks confirmed factual closure with no active execution, unchanged approval and earlier accepted evidence. The persistence modules are byte-identical to the published baseline. The failed CLI exit remains failed; a fresh focused case checks the complete successful lifecycle separately. Remote CI must pass all 719 cases in one complete run before release acceptance.

Archived help/version probes establish CLI argument availability only at their recorded time. They do not establish current client installation, authentication or live model/tool execution. Compatibility is supported by official source contracts and strict synthetic CLI tests; check each intended client in its actual deployment environment.

## Rerun and audit results

From a full clone, use an explicitly authorized fresh absolute test directory:

```powershell
npm run check:skill
if ($LASTEXITCODE -ne 0) { throw 'Skill validation failed' }
npm test -- --work-root 'AUTHORIZED_NEW_ABSOLUTE_TEST_DIRECTORY'
if ($LASTEXITCODE -ne 0) { throw 'Main regression process failed' }
```

Read the actual `fixtures-*/regression-results.json`. Check the preserved machine identifier `codex-task-harness-regression`, `selection=all`, tests/passed/record count 719, failed 0, every pass flag and unique nonempty IDs. A `--case-prefix` selection is diagnostic evidence only. Exit zero or one printed number cannot establish a complete pass.

The local raw result SHA-256 is:

```text
68d1c5e2b6f57f030987b2485533582b432f6b5c467e5b4b6cdb1a4521eb01dd
```

The focused result SHA-256 is:

```text
1936ab691504151488a3f36ad15d583a15dd28e7234ba3593df18b643c17eb00
```

The complete ordered ID roster SHA-256 (UTF-8 JSON.stringify(ids)) is:

```text
02b697a4e6d4b0bf30ad75d73976bb99ffdd6c364c20ae70d050e02751c01ac5
```

The preserved preceding 532 ordered prefix is:

```text
b370dca31a947171c4ad83bb50fc1863c28c4d123f83d3118a896bbccd66dcca
```

The preserved original 399 ordered prefix is:

```text
a4cc9efaa58e8f89537e045631f8c9186dcdf2079160837b76ee2a1c411e99cc
```

Hashes identify content; they do not independently prove origin or correctness. Raw results contain machine-local paths and remain private.

## Remote CI and unperformed coverage

Windows CI pins checkout/setup-node commits, uses Node 26, a full Git history, read-only contents permission and no persisted credentials or package-manager cache. It checks native exits, all 21 modules, all 719 results, individual pass flags, unique IDs and all three ordered roster digests. Exact environment and outcome belong to that run's logs. This page does not predeclare remote success.

**The original 84 cross-runtime upgrade cases were NOT RUN.** Their matching external frozen baseline is unavailable. Main regressions, goldens, the 114 captured current-baseline continuations and eight genuine old-install rollbacks cannot substitute for them. No reconstructed source impersonates that missing external baseline.

**DeepSeek Harness was not installed or live-tested.** Support targets official commit `687f282e8625c6b8d11ff58211a90524be2e4317` and `@deepseek-ai/dsh` `0.2.1-rc.2`, with official-source and strict local fixture evidence. Actual DSH discovery, composed services, provider/authentication and model behavior remain unverified. No real-model run for Codex or Claude is included either.

Other OS behavior, every client/Node version and a minimum Node version are not established. See [Compatibility](COMPATIBILITY.md) and [host contracts](HOSTS.md).
