# Host profiles

[README](../README.md) · [Getting started](GETTING_STARTED.md) · [Compatibility](COMPATIBILITY.md)

Codex, Claude Code and official DeepSeek Harness share one skill, contract and evidence engine. A profile supplies discovery conventions, instruction targets and independent CLI arguments. Host selection does not install a client or grant execution permission.

## Native discovery and installation targets

| Profile | Usual home | Instruction file | Usual user skill root | Native entry |
| --- | --- | --- | --- | --- |
| `codex` | `~/.codex`, or actual Codex home | `AGENTS.md` | `~/.agents/skills` | `$codex-task-harness` |
| `claude-code` | `~/.claude`, or configured Claude home | `CLAUDE.md` | `<Claude home>/skills` | `/codex-task-harness` |
| `deepseek-harness` | `DSH_HOME`, otherwise `~/.dsh` | `AGENTS.md` | `<DSH home>/skills` | Ask DSH to load the skill; conditional `/name` below |

The installer requires explicit home and skill-root targets. Usual locations are examples; canonical preview targets are what the user reviews.

Codex discovers project and user `.agents/skills`. Claude uses its `.claude/skills` conventions. Pinned DSH discovers project `.dsh/skills` and `.agents/skills`, explicit roots and user roots, with documented precedence. Its instruction chain includes DSH-home and shared agents-home instructions. The installer writes only the selected home and skill root, not every searched directory.

DSH needs the filesystem-skill provider and `dsh-tool-skill` consumer enabled. A discovered user-invocable skill can be loaded with `/codex-task-harness` in direct user input. This is DSH's whitespace-delimited skill gesture, separate from its command registry. Otherwise name the skill and require confirmation that the actual instructions were discovered and loaded. Changing providers or settings needs applicable authorization.

`agents/openai.yaml` is a Codex UI extension. Common instructions load only the actual host reference: [Codex](../skills/codex-task-harness/references/hosts/codex.md), [Claude Code](../skills/codex-task-harness/references/hosts/claude-code.md), or [DSH](../skills/codex-task-harness/references/hosts/deepseek-harness.md).

## Native work and independent CLI work

Native work uses tools actually available in that session. The runtime records boundaries and evidence; it does not emulate another host's tools. Independent run starts a local client and needs applicable model/resource/execution authorization.

| Host | Independent argv after the local entry | Permission behavior |
| --- | --- | --- |
| Codex | `exec --sandbox workspace-write -c approval_policy="on-request" --skip-git-repo-check --json -` | Existing workspace-write/on-request options |
| Claude Code | `-p` | Normal configured print-mode permissions; noninteractive approvals can be denied |
| DSH | `--profile headless --json -` | Enabled headless tools and policies; no Codex sandbox equivalence |

The project is cwd. The supervisor writes prepared input to stdin, closes stdin and observes actual process close. No permission-bypass flags, provider/model overrides, GUI/server mode, fallback host or session-resume side channel are added. Outer task approval does not override host restrictions.

The pinned DSH headless profile disables its managed GUI credential store and associated consumers by default. It uses documented launch-environment/.env provider routes; a GUI sign-in alone does not establish headless authentication. This project does not change that configuration or supply credentials. See the [official headless contract](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/bundle/headless/README.md).

DSH stdout is checked separately from stderr: opening session, the final turn's `reason.kind=completed`, and a terminal final event must agree with a successful process outcome. A final event can also accompany a failed turn; JSON syntax or exit0 alone cannot establish acceptance. Raw process and protocol facts remain in the receipt, and artifacts still need verify.

## Reviewed selection and original identity

```json
{
  "templateVersion": 4,
  "execution": {
    "allowedHosts": ["codex", "claude-code"],
    "defaultHost": "codex"
  }
}
```

Allowed hosts must be nonempty and unique; default must be a member. Draft's `--host` chooses and allows the default; repeated `--allow-host` adds reviewed alternatives. Context, begin and run use that default unless an allowed host is explicitly selected.

| Native executor | CLI executor |
| --- | --- |
| `codex-native` | `codex-cli` |
| `claude-code-native` | `claude-code-cli` |
| `deepseek-harness-native` | `deepseek-harness-cli` |

New begins bind original host/mode/executor. Context preserves an active run's submission identity even when another host is requested. Drift, replay or a later approval cannot relabel it. Use runtime-generated fields, not caller-invented identity.

Templates1–3, including omitted version interpreted as1, retain Codex behavior. New policy keys in old arbitrary data do not enable another host. Resolve pending acceptance and close active facts before deliberately revising and reviewing the complete package for an upgrade.

## Local executable resolution

`--executable LOCAL_ENTRY` selects an existing local entry. `--codex` is a Codex-only alias; combining both is rejected. Supported npm shims resolve through the official package identity/bin without running a shell. Claude can resolve to native `bin/claude.exe`; DSH's pinned package uses `lib/bin.js`. No download or fallback is performed.

Raw exit/signal, timeout, control errors and logs remain distinct. A failed kill does not prove close. Doctor's version/help probes do not prove model execution or native skill discovery.

## Evidence scope

DSH support is pinned to [official commit 687f282e8625c6b8d11ff58211a90524be2e4317](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317), containing `@deepseek-ai/dsh` `0.2.1-rc.2`. Developer-preview changes require renewed checks.

[VALIDATION](VALIDATION.md) separates source inspection, strict fixtures, synthetic install/rollback and model-free executable probes. DSH was not installed: live DSH loading, provider integration and model execution remain unverified. No real-model run for any host is included.

The original **84 cross-runtime upgrade cases were not run** because the matching external frozen baseline is unavailable. Current-baseline continuations, goldens and host fixtures do not replace that suite.
