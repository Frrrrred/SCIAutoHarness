# DeepSeek Harness host

Read only for official [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness), CLI dsh. This differs from a DeepSeek model API used in another host. Shared [runtime](../runtime.md) owns lifecycle/recovery.

## Fixed source and evidence

The adapter targets [687f282e8625c6b8d11ff58211a90524be2e4317](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317), `@deepseek-ai/dsh` 0.2.1-rc.2. It is developer preview, not a guarantee for every version.

Confirm discovery, provider authentication and available services in the selected host before using this adapter. A source-level interface description does not establish that the host is configured for model execution.

For role/ownership decisions or execution/verification/rework handoff, use the authoritative [collaboration protocol](../context-hygiene.md). Default native delegates are read-only; a verifier does not call state-mutating verify. Separate chats and business/control writing require their actual authorization. See [current snapshots](../runtime.md#review-snapshots-and-acceptance) for the exact reviewed version.

## Native skill

The filesystem provider discovers project .dsh/skills and .agents/skills and documented user/explicit roots. Global instructions include selected DSH-home and shared agents-home AGENTS files. Providers can be disabled by the profile operator; copying a file does not prove loading.

When filesystem skills and the dsh-tool-skill consumer are enabled, a discovered user-invocable skill supports "/sciautoharness" in direct user text. This whitespace-delimited skill gesture is separate from the command registry. Otherwise name the skill and require confirmation that the actual instructions were discovered/loaded. See the [official consumer](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/skill/tool-skill/src/index.ts).

Use only actually mounted file/terminal/delegation tools. Do not assume Codex or Claude APIs. Follow context-first, begin only with reviewed deepseek-harness policy, perform real work and submit original runId with deepseek-harness-native. The shared Skill does not install extra host plugins or hooks.

## Independent run

Authorized run --host deepseek-harness --executable LOCAL invokes:

```text
--profile headless --json -
```

Project cwd, prepared stdin/EOF and shell:false apply. Use an existing native or official npm JS entry. No downloader, server/GUI, profile/provider/model setting, bypass or session reuse is introduced.

The pinned headless profile disables managed GUI credentials by default and uses documented environment/.env routes; GUI login alone does not establish headless auth. The adapter does not change credentials/configuration. See [official headless behavior](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/bundle/headless/README.md).

The profile owns permissions, not Codex sandbox semantics. Stdout JSON opens session, ends final and reports final turn_end reason.kind. Failed turns may have final; exit/status/stream and actual close must agree. The adapter records protocol errors separately from raw exit/signal/control/log facts. Even a successful protocol and exit0 still need artifact acceptance.

## Current installation and execution identity

Preview --host deepseek-harness --host-home HOME --skill-root ROOT, review the exact current plan, then apply. The profile uses only that home's fixed AGENTS.md and the explicit direct sciautoharness child. Nearby instruction overrides conservatively require review. The source inventory, plan/record and metadata use the current namespace; unsupported inputs remain unchanged and are refused. Current rollback requires a complete installed transaction and all original plan/backup/object/metadata prechecks; no tree conversion is performed.

The reviewed execution.allowedHosts/defaultHost policy must explicitly permit deepseek-harness. Native and CLI executors are distinct and remain bound to the original run. Another host or profile cannot relabel it. Spawned run returns a direct processObservation with executionClosed=false and keeps the original run active. Its controller observes actual business activity and relevant descendants ending, then supplies --business-end-reference on same-run submit. This evidence step uses existing permission. Unknown activity retains the original handle and blocks another writer; actual end maps eligible ok to pending_acceptance, eligible failed to failed, and ineligible work to stale factual closure. No extra hooks, providers, permission settings or services are installed. Source/help/version checks are not live model evidence. See [recovery](../recovery-maintenance.md).
