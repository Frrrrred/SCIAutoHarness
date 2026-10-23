# codex-task-harness

**A Codex skill and local task runtime developed around the Harness engineering principles taught in [learn-claude-code](https://github.com/shareAI-lab/learn-claude-code), with references to its current s01–s17 course.**

Codex does the reasoning and work. The harness keeps the complete plan, approval, dependencies, execution identity and acceptance evidence explicit.

[中文](README.md) · [Getting started](docs/GETTING_STARTED.md) · [Architecture](docs/ARCHITECTURE.md) · [Validation](docs/VALIDATION.md) · [Attribution](ATTRIBUTION.md)

## Highlights

- Review the complete master, major stages, shared protocols and recovery plan before formal work.
- Load current-stage context progressively instead of rereading the entire task history.
- Advance a dependency graph only after upstream work is verified.
- Separate begin, actual execution, factual submit and acceptance verify.
- Propagate stale evidence to affected downstream results.
- Preserve original active run identity, support factual stale closure and reject conflicting replays.
- Retain acceptance failures, logs, process facts and recovery diagnostics.
- Preview installation changes and preserve personal AGENTS content.
- Support software, general and research tasks with explicit evidence requirements.

The runtime records caller-supplied authorization; it is not an identity provider or an operating-system sandbox. Artifact existence and exit zero do not prove correctness.

## Start

```powershell
git clone https://github.com/Frrrrred/codex-task-harness.git
cd codex-task-harness
npm run check:skill
npm run help
```

No npm dependencies are required for the core. Install only the nested skills/codex-task-harness directory. The installer recursively copies its source, so the repository root must not be used as the skill source.

See [GETTING_STARTED](docs/GETTING_STARTED.md) for explicit installation preview, native Codex prompts and recovery. The runtime references inside the skill remain authoritative for detailed commands.

## Evidence and compatibility

The complete main suite covers task lifecycles, template compatibility, recovery and installation rollback. [VALIDATION](docs/VALIDATION.md) reports the actual case count, environment and local results; [Windows CI](https://github.com/Frrrrred/codex-task-harness/actions/workflows/validate.yml) reports remote execution separately.

**The 84 cross-runtime upgrade cases were not run.** Their matching external frozen baseline is currently unavailable. Golden checks, the main suite and other compatibility checks do not substitute for that upgrade suite.

Windows / Node v26.12.1 is the established local validation environment. Full tests also require Python, pwsh and filesystem link/ACL/NTFS stream capabilities. Other platforms and a minimum Node version are not claimed without testing. Independent run needs a locally available Codex executable and applicable authorization; native host tools are the usual route.

## Origins

This Codex skill applies the Harness engineering principles taught in learn-claude-code. It preserves the required MIT notices for code and reference materials. It is not a direct fork of the tutorial or an official OpenAI or shareAI Lab product.

Repository documentation and CI live outside the installable skill. See [ATTRIBUTION](ATTRIBUTION.md), [course mapping](docs/LEARN_CLAUDE_CODE.md), [compatibility](docs/COMPATIBILITY.md), [contributing](CONTRIBUTING.md) and [security reporting](SECURITY.md).
