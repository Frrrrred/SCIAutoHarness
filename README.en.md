# codex-task-harness

This compatibility entry preserves existing English links. [README.md](README.md) is the authoritative English introduction to the shared skill and runtime for Codex, Claude Code and official DeepSeek Harness.

## Highlights

Complete plans and direct human review, progressive context loading, verified dependencies, separate execution and acceptance, stale-evidence propagation, original-run recovery, retained failures and installation preview/rollback remain the core workflow.

Three host profiles share one skill and evidence engine. Host selection is part of the new reviewed execution policy. See [all features](README.md#why-use-it), [host profiles](docs/HOSTS.md) and [architecture](docs/ARCHITECTURE.md).

## Start

```powershell
git clone https://github.com/Frrrrred/codex-task-harness.git
cd codex-task-harness
npm run check:skill
npm run help
```

The core requires no third-party npm dependency. Install only the nested `skills/codex-task-harness` source. [Getting started](docs/GETTING_STARTED.md) covers preview, approval, installation, native invocation and recovery.

## Evidence and compatibility

[VALIDATION](docs/VALIDATION.md) reports actual results; [Windows CI](https://github.com/Frrrrred/codex-task-harness/actions/workflows/validate.yml) reports remote execution separately.

The original **84 cross-runtime upgrade cases were not run**. DSH is scoped to pinned official source and local fixtures, with no live DSH verification. No real model run for any host is included. See [Compatibility](docs/COMPATIBILITY.md) for frozen templates, permissions and installation safety.

## Origins

The design draws on [learn-claude-code](https://github.com/shareAI-lab/learn-claude-code), s01–s17. Required MIT notices are retained. See [Attribution](ATTRIBUTION.md) and the [course mapping](docs/LEARN_CLAUDE_CODE.md) for source relationships and implementation boundaries.
