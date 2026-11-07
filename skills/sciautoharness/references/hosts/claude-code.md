# Claude Code host

Read only for actual Claude Code or its selected profile. Shared [runtime](../runtime.md) owns lifecycle/recovery.

For role/ownership decisions or execution/verification/rework handoff, use the authoritative [collaboration protocol](../context-hygiene.md). Default native delegates are read-only; a verifier does not call state-mutating verify. Separate chats and business/control writing require their actual authorization. See [current snapshots](../runtime.md#review-snapshots-and-acceptance) for the exact reviewed version.

## Native skill

Claude discovers user ~/.claude/skills and project .claude/skills, plus documented plugin routes. Use a direct sciautoharness child and CLAUDE.md instructions. Invoke "/sciautoharness" or matching work. OpenAI UI YAML does not configure Claude.

Use exposed native Read/Glob/Grep/Edit/Write/Bash tools when present; Agent only when available and permitted. Do not assume Codex functions/collaboration APIs. Follow context-first through the actual terminal tool, begin with allowed Claude policy, perform real native work and submit original runId with claude-code-native. Human review and evidence acceptance remain unchanged.

## Independent run

Authorized run --host claude-code --executable LOCAL invokes:

```text
-p
```

Prepared prompt goes through stdin then EOF, with project cwd and shell:false. Resolve existing native executable or supported official npm bin; a shim is not executed. Packaging varies: a native bin/claude.exe package is not assumed to have cli.js.

Normal configured print permissions remain; noninteractive approvals may be denied. No bypass, provider/model/settings/session override or fallback is added. A denial is an actual outcome, not permission to choose a weaker mode.

## Current installation and execution identity

Preview --host claude-code --host-home HOME --skill-root ROOT, review the exact current plan, then apply. The profile uses only that home's fixed CLAUDE.md and the explicit direct sciautoharness child. Nearby instruction overrides conservatively require review. The source inventory, plan/record and metadata use the current namespace; unsupported inputs remain unchanged and are refused. Current rollback requires a complete installed transaction and all original plan/backup/object/metadata prechecks; no tree conversion is performed.

The reviewed execution.allowedHosts/defaultHost policy must explicitly permit claude-code. Native and CLI executors are distinct and remain bound to the original run. Another host or profile cannot relabel it. Spawned run returns a direct processObservation with executionClosed=false and keeps the original run active. Its controller observes actual business activity and relevant descendants ending, then supplies --business-end-reference on same-run submit. This evidence step uses existing permission. Unknown activity retains the original handle and blocks another writer; actual end maps eligible ok to pending_acceptance, eligible failed to failed, and ineligible work to stale factual closure. No extra hooks, providers, permission settings or services are installed. Source/help/version checks are not live model evidence. See [recovery](../recovery-maintenance.md).
