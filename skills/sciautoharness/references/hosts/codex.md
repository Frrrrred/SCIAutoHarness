# Codex host

Read only for actual Codex or its selected profile. The shared [runtime](../runtime.md) owns lifecycle/recovery.

For role/ownership decisions or execution/verification/rework handoff, use the authoritative [collaboration protocol](../context-hygiene.md). Default native delegates are read-only; a verifier does not call state-mutating verify. Separate chats and business/control writing require their actual authorization. See [current snapshots](../runtime.md#review-snapshots-and-acceptance) for the exact reviewed version.

## Native skill

Codex discovers documented project/user .agents/skills. Install the direct sciautoharness child of the selected root; the separate instruction home contains AGENTS.md. Use `$sciautoharness` or a matching request. agents/openai.yaml is Codex-specific UI metadata.

Use actual native file/patch/terminal/delegation tools exposed by this session; names/APIs vary by surface/version. Current inventory takes precedence. After context-first loading, begin with the allowed Codex policy, perform actual work and submit original runId with codex-native. Receipts do not replace actual activity or acceptance.

## Independent run

Use run --host codex --executable LOCAL only with applicable independent-process/model authorization. Exact argv is:

```text
exec --sandbox workspace-write -c approval_policy="on-request" --skip-git-repo-check --json -
```

Project is cwd; prepared stdin ends with EOF; shell:false. Supported npm entries resolve without launching a shim shell. Sandbox/approval behavior remains Codex-owned, not universally equivalent. A denial is a real failure. No download/provider/model/session/fallback is added.

## Current installation and execution identity

Preview --host codex --host-home HOME --skill-root ROOT, review the exact current plan, then apply. The profile uses only that home's fixed AGENTS.md and the explicit direct sciautoharness child. Nearby instruction overrides conservatively require review. The source inventory, plan/record and metadata use the current namespace; unsupported inputs remain unchanged and are refused. Current rollback requires a complete installed transaction and all original plan/backup/object/metadata prechecks; no tree conversion is performed.

The reviewed execution.allowedHosts/defaultHost policy must explicitly permit codex. Native and CLI executors are distinct and remain bound to the original run. Another host or profile cannot relabel it. Spawned run returns a direct processObservation with executionClosed=false and keeps the original run active. Its controller observes actual business activity and relevant descendants ending, then supplies --business-end-reference on same-run submit. This evidence step uses existing permission. Unknown activity retains the original handle and blocks another writer; actual end maps eligible ok to pending_acceptance, eligible failed to failed, and ineligible work to stale factual closure. No extra hooks, providers, permission settings or services are installed. Source/help/version checks are not live model evidence. See [recovery](../recovery-maintenance.md).
