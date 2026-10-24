# Validation record

[README](../README.md) · [Compatibility](COMPATIBILITY.md) · [Contributing and reruns](../CONTRIBUTING.md)

Local validation completed on 2026-10-24 (Asia/Shanghai). This page records actual local evidence for the current implementation. The corresponding remote commit and run are checked separately through [Windows CI](https://github.com/Frrrrred/codex-task-harness/actions/workflows/validate.yml); a local pass is not a claim about another commit or environment.

## Actual local results

| Check | Observed result |
|---|---|
| Complete main suite | **532/532 passed, 0 failed**, selection=all, actual exit 0 |
| Original coverage | All 399 original ordered IDs retained, plus 133 new unique host/compatibility guards |
| Result integrity |532 complete records, 532 unique nonempty IDs, every pass=true |
| Fixture preparation |1 recorded retry for a definitive Windows master-rename denial before synthetic approval/execution; original error retained |
| Modules | All16 MJS modules passed node --check |
| Skill format | Portable checker and separate upstream Python format validator passed; Codex implicit invocation remains enabled |
| Root wrappers | check:skill, help and help:submit passed; npm test routing is checked separately from the full direct Node entry |
| Old master bytes | Complete v1/v2/v3 golden comparisons pass; new drafts use template 4; invalid/future 5/type guards retained |
| Actual baseline continuations | All32 pre-change missing/1/2/3 × two-layout × approved/pending/verified/active scenes continued to verified; original contract/master, approval, existing receipts/evidence preserved |
| Old arbitrary policy data |1 additional actual template3 scene preserved its arbitrary execution JSON and effective Codex-only behavior |
| Actual legacy installation rollback | Both original safety1 scenes rolled back:28 targets for the new installation and2 for replacement; original files/identities/configuration/ACL/NTFS streams restored, backups preserved |
| Native recovery combinations |6 additional three-host/two-layout failed-rework, active-gate, old-failed-replay and negative-result lifecycles passed |
| Profile metadata |3 additional host installation/rollback cases preserved original BOM/CRLF/Unicode/no-final-newline bytes, inode, ACL, NTFS stream and synthetic configuration |
| Strict CLI contracts | Permanent cases check exact argv, cwd, stdin EOF, original executor and raw exit/close, including DSH malformed/missing/failed terminal output and publication recovery |
| Shared targets | Actual different-home operations use one shared-root gate; canonical ordering, alias deduplication, partial acquisition/release and cleanup diagnostics passed |
| Existing Codex probe | codex-cli 0.163.0-alpha.11.2: --version and exec --help exit 0, required arguments present; isolated homes/logs |
| Existing Claude probe | Claude Code 2.1.309: --version and --help exit 0 through the provided official npm native entry; isolated homes/logs and documented traffic/update suppression |
| Public content | English maintained prose, local links/fragments, Skill metadata, licenses, sources and privacy/inventory checked; no personal instructions, configuration, logs or temporary scenes are shipped |

The established local environment is Windows / Node **v26.12.1**, Python **3.14.7** and PowerShell **7.6.7**. Required links, ACLs and NTFS streams were actually exercised. No npm dependency, DSH client or extra service was installed, and no real model was called for any host. Help/version probes do not establish model authentication or live tool execution.

The old scenes were created before candidate edits by the actual published runtime at [38d7d99dcd60b94f702d82f640b7dc4172530cfa](https://github.com/Frrrrred/codex-task-harness/commit/38d7d99dcd60b94f702d82f640b7dc4172530cfa). They are distinct from same-runtime permanent regressions and the unperformed external-baseline suite. Original v1/v2 goldens and provenance remain unchanged; the complete v3 oracle was captured from that published runtime with its 27 source identities.

The raw evidence retains earlier red tests, an intermediate 532-case run with two Windows EPERM fixture-preparation failures, both fresh focused passes and the final full pass. Only bounded, never-approved/never-executed synthetic setup retries are allowed; production operations and tested fault paths are not automatically retried.

## Rerun and audit results

From the clone root, use an explicitly authorized fresh absolute test directory:

```powershell
npm run check:skill
if ($LASTEXITCODE -ne 0) { throw 'Skill validation failed' }
npm test -- --work-root 'AUTHORIZED_NEW_ABSOLUTE_TEST_DIRECTORY'
if ($LASTEXITCODE -ne 0) { throw 'Main regression process failed' }
```

Read the actual fixtures-*/regression-results.json, checking suite, selection=all, tests/passed/record count 532, failed 0, every pass flag and unique nonempty IDs. A --case-prefix selection is diagnostic evidence only. Do not infer a complete pass from a filtered run, exit code or one printed number.

The local raw result SHA-256 is:

```text
b249b3be2a2f6d2a94b2d0fd7a493dafd87db122c651ad776f22c112417cdbac
```

The ordered ID roster SHA-256 (UTF-8 JSON.stringify(ids)) is:

```text
b370dca31a947171c4ad83bb50fc1863c28c4d123f83d3118a896bbccd66dcca
```

The preserved original 399 ordered prefix has SHA-256:

```text
a4cc9efaa58e8f89537e045631f8c9186dcdf2079160837b76ee2a1c411e99cc
```

These identify actual content; they do not independently prove origin or correctness. Full raw results contain machine-local paths and remain in private verification evidence. The repository ships no personal rules, credentials or runtime task scenes.

## Remote CI and unperformed coverage

Windows CI pins checkout/setup-node commits, uses Node 26 with read-only contents permission and no persisted credentials or package-manager cache. It checks every native exit, all 16 modules, the complete 532 results, individual pass flags, unique IDs and both ordered roster digests. Exact patch/image/remote results belong to that run's logs. This page does not predeclare remote success.

**The original 84 cross-runtime upgrade cases were NOT RUN.** Their matching external frozen baseline is unavailable. Main tests, goldens,32 current-baseline transitions, the additional old-data scene and real safety1 rollbacks do not replace them. No source was downloaded or reconstructed to impersonate that baseline.

**DeepSeek Harness was not installed or live-tested.** Support targets official commit 687f282e8625c6b8d11ff58211a90524be2e4317 and `@deepseek-ai/dsh` `0.2.1-rc.2`, with official-source and strict local fixture evidence. Actual DSH discovery, composed services, provider/authentication and model behavior remain unverified. No real-model run for Codex or Claude is included either.

Other OS behavior, every client/Node version and a minimum Node version are not established. See [Compatibility](COMPATIBILITY.md) and [host contracts](HOSTS.md) for actual permission and integration limits.
