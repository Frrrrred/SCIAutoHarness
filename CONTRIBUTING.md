# Contributing

Read [README](README.md), [architecture](docs/ARCHITECTURE.md), [hosts](docs/HOSTS.md), [compatibility](docs/COMPATIBILITY.md) and [attribution](ATTRIBUTION.md).

## Reporting a problem

Use [Issues](https://github.com/Frrrrred/agent-task-harness/issues). Include objective, steps, expected/actual behavior, host/mode, Node/OS and relevant filesystem conditions, with minimal sanitized evidence. Security issues follow [SECURITY](SECURITY.md).

## Change boundaries

- Keep the installable product under skills/agent-task-harness; repository docs/CI stay outside it.
- Focus on a concrete problem, affected states/entrypoints/profiles and acceptance.
- Preserve one shared state/evidence engine and small host adapters.
- Retain MIT/source notices. Never regenerate an old golden with the candidate to make compatibility pass.
- Treat schema/template/revision/host policy/executor/safety metadata as interfaces.
- For persistence/render changes cover approved, pending, verified and active work, original-run closure, replay, drift and failures.
- Preserve user originals and immutable evidence; English prose must not weaken Unicode or old input behavior.
- Label controlled authorization/processes SYNTHETIC. Keep personal rules, secrets, conversations, real state, backups and logs out of the public tree.

## Local validation

Core requires no package installation. From the repository root:

```powershell
npm run check:skill
npm run help
npm run help:submit
$workRoot = Join-Path ([IO.Path]::GetTempPath()) ('agent-task-harness-test-' + [guid]::NewGuid())
npm test -- --work-root $workRoot
if ($LASTEXITCODE -ne 0) { throw 'Main regression failed' }
```

The root must be absolute and authorized for synthetic writes. Full tests also require Python/pwsh and link/ACL/NTFS capabilities. See [validation](docs/VALIDATION.md). The actual result contains selection, totals, failures and preparation retries. Complete execution must match the exact CI roster, with every required ID once. A filtered or silently skipped subset is not a full pass.

Check all maintained English prose, metadata, links/anchors, commands, source notices and installation boundaries. Execution changes require lifecycle, combined-state and failure recovery checks. Exit0, files or positive examples do not establish acceptance.

## Host evidence

Separate source inspection, executable probes, controlled processes and live host/model runs. Use authorized local clients only; never implicitly install/download/enable services/change settings/call models. Assert exact argv/stdin/EOF, close, raw exit/signal, timeout/log errors and original identity. Test reviewed host selection without fallback. Synthetic install/rollback must cover shared roots, locks, drift, partial changes and original bytes.

Check DSH's pinned official contract; an imitation child is not live DSH. Preserve all original main IDs and purposes, adding separate cases for new defaults.

**The original84 upgrade suite has not run.** It requires the real digest-matching external frozen baseline. The candidate, tutorial and reconstructed older code are not substitutes. Current-baseline and host tests are separate evidence.

## Pull requests

Describe concrete problem, final behavior, actual checks, unexecuted checks and compatibility. Preserve failed/negative evidence. Read real CI logs; fix behavior rather than weakening assertions or exact gates.

Rename regressions use verified sources from preserved commits 9b2532ffb6437193d6f6800a54a115ea2b6552e5 and 38d7d99dcd60b94f702d82f640b7dc4172530cfa in this repository. Use a full clone (CI fetch-depth: 0); each extracted file is checked against the frozen inventory before the producer runs. No external download or model execution is part of these tests. These sources do not replace the original 84-case external-baseline upgrade suite.
