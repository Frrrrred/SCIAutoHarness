# Host profiles

[README](../README.md) · [Installation](GETTING_STARTED.md) · [Compatibility](COMPATIBILITY.md)

SCIAutoHarness runs within the selected host. The shared runtime records plans, execution identity and acceptance. Native tools, discovery, credentials and model permissions belong to that host.

| Host | Instruction home | Skill parent | Native entry |
|---|---|---|---|
| Codex | `~/.codex` | `~/.agents/skills` | `$sciautoharness` |
| Claude Code | `~/.claude` | `~/.claude/skills` | `/sciautoharness` |
| DeepSeek Harness | `DSH_HOME` or `~/.dsh` | selected home `/skills` | Ask the host to load `sciautoharness` |

Select actual absolute paths for installation. Codex and DSH use `AGENTS.md`; Claude Code uses `CLAUDE.md`. Codex UI metadata permits implicit selection of the formal skill. Other hosts use their own discovery and invocation rules. DSH needs enabled skill providers and a consumer; slash invocation depends on its consumer.

New task plans explicitly declare their allowed/default hosts. An active execution keeps its original host, mode and executor. Selecting a host does not authorize model calls, downloads, provider changes or external writes.

Native execution uses the current session's available tools. Independent CLI execution needs explicit authorization and an already available official executable. A version/help probe establishes executable availability only. Host adapters do not provide equivalent OS isolation or guarantee authenticated model access.

Host-specific operating details: [Codex](../skills/sciautoharness/references/hosts/codex.md), [Claude Code](../skills/sciautoharness/references/hosts/claude-code.md), [DeepSeek Harness](../skills/sciautoharness/references/hosts/deepseek-harness.md).
