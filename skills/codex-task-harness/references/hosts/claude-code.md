# Claude Code host

Read only for actual Claude Code or its selected profile. Shared [runtime](../runtime.md) owns lifecycle/recovery.

## Native skill

Claude discovers user ~/.claude/skills and project .claude/skills, plus documented plugin routes. Use a direct codex-task-harness child and CLAUDE.md instructions. Invoke `/codex-task-harness` or matching work. OpenAI UI YAML does not configure Claude.

Use exposed native Read/Glob/Grep/Edit/Write/Bash tools when present; Agent only when available and permitted. Do not assume Codex functions/collaboration APIs. Follow context-first through the actual terminal tool, begin with allowed Claude policy, perform real native work and submit original runId with claude-code-native. Human review and evidence acceptance remain unchanged.

## Independent run

Authorized run --host claude-code --executable LOCAL invokes:

```text
-p
```

Prepared prompt goes through stdin then EOF, with project cwd and shell:false. Resolve existing native executable or supported official npm bin; a shim is not executed. Packaging varies: a native bin/claude.exe package is not assumed to have old cli.js.

Normal configured print permissions remain; noninteractive approvals may be denied. No bypass, provider/model/settings/session override or fallback is added. A denial is an actual outcome, not permission to choose a weaker mode.

## Installation and compatibility

Preview --host claude-code --host-home HOME --skill-root ROOT, review and apply. Fixed CLAUDE.md and explicit skill root are used, not other hosts' settings. Nearby local instruction files conservatively require review without claiming global override semantics.

New4 must allow claude-code. Old templates remain Codex; close their original activity and resolve pending acceptance before a reviewed upgrade. No hooks/provider/permission configuration is installed. Native and CLI identities differ; neither proves acceptance. Source/help/version checks are not live model runs. See [recovery](../recovery-maintenance.md).
