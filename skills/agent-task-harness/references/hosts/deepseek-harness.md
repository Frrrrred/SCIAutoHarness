# DeepSeek Harness host

Read only for official [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness), CLI dsh. This differs from a DeepSeek model API used in another host. Shared [runtime](../runtime.md) owns lifecycle/recovery.

## Fixed source and evidence

The adapter targets [687f282e8625c6b8d11ff58211a90524be2e4317](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317), `@deepseek-ai/dsh` `0.2.1-rc.2`. It is developer preview, not a guarantee for every version.

DSH was not installed for validation and no live model was called. Source/strict fixtures do not establish live discovery, provider auth, composed services or model behavior. Consult repository validation for actual evidence.

## Native skill

The filesystem provider discovers project .dsh/skills and .agents/skills and documented user/explicit roots. Global instructions include selected DSH-home and shared agents-home AGENTS files. Providers can be disabled by the profile operator; copying a file does not prove loading.

When filesystem skills and the dsh-tool-skill consumer are enabled, a discovered user-invocable skill supports `/agent-task-harness` in direct user text. This whitespace-delimited skill gesture is separate from the command registry. Otherwise name the skill and require confirmation that the actual instructions were discovered/loaded. See the [official consumer](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/skill/tool-skill/src/index.ts).

Use only actually mounted file/terminal/delegation tools. Do not assume Codex or Claude APIs. Follow context-first, begin only with reviewed deepseek-harness policy, perform real work and submit original runId with deepseek-harness-native. The shared Skill does not install extra host plugins or hooks.

## Independent run

Authorized run --host deepseek-harness --executable LOCAL invokes:

```text
--profile headless --json -
```

Project cwd, prepared stdin/EOF and shell:false apply. Use an existing native or official npm JS entry. No downloader, server/GUI, profile/provider/model setting, bypass or session reuse is introduced.

The pinned headless profile disables managed GUI credentials by default and uses documented environment/.env routes; GUI login alone does not establish headless auth. The adapter does not change credentials/configuration. See [official headless behavior](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/bundle/headless/README.md).

The profile owns permissions, not Codex sandbox semantics. Stdout JSON opens session, ends final and reports final turn_end reason.kind. Failed turns may have final; exit/status/stream and actual close must agree. The adapter records protocol errors separately from raw exit/signal/control/log facts. Even a successful protocol and exit0 still need artifact acceptance.

## Installation and old tasks

Preview --host deepseek-harness --host-home HOME --skill-root ROOT, review and apply. Only that home's fixed AGENTS.md and explicit skill root are written, not shared agents-home instructions. Nearby local files conservatively require review.

New template 4 must allow this host. Missing/1/2/3 retain original Codex behavior, reviewed bytes and original runs. Resolve pending acceptance/close activity before a reviewed upgrade. A different host or changed profile cannot relabel old facts. See [recovery](../recovery-maintenance.md).
