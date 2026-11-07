# Current task runtime

For an existing supplied task, first read its master and recovery, then immediately derive context. Read this interface as needed before context; defer scope files, README, enumeration, raw state and predecessor reports until the selected context identifies a specific need. Keep one business writer and one controller under [context and collaboration](context-hygiene.md).

The host performs reasoning and actual work. This local Node runtime manages the reviewed contract, original execution identity and evidence. It does not authenticate people, provide OS isolation, start a scheduler or grant permission for tools, network, installation or model calls.

## Records and locations

The only current task location is `project/harness/id`. A package contains the master, complete contract, mapped phase/protocol documents and recovery; runtime-owned state, receipts, logs and acceptance records remain separate from reviewed specifications.

Every product JSON record uses `format="sciautoharness"`, `schemaVersion=1` and a fixed entry kind. Contract, state, decision, submission, receipt, review-snapshot, reviews, acceptance-report, scan-binding, install-plan, install-record and metadata have closed fields and typed nested structures. Caller extensions belong in an explicit extensions object and participate in canonical comparisons. Unknown fields, duplicate JSON keys, malformed UTF-8, unsupported kinds and missing current headers are refused. JSON is bounded to16MiB, individual decoded strings to1MiB, arrays/maps to10000 members and nesting to64 levels.

File inputs are validated before locks, directories, logs, backups or metadata/model helpers. Mutations re-read and validate after taking their writer lock. Acceptance binds the contract and state payloads read under that lock to the first evidence capture. It rechecks the original state source before either success or failure persistence; a newer, corrupt or unreadable state is preserved and requires fresh evidence rather than a stale write. A command failure is not a claim that bytes could not have changed; preserve actual progress, original errors and cleanup errors.

Unsupported records remain unchanged. This runtime neither converts them nor inherits approval or verified status. Already active tasks continue with the controller that began them under their existing approval and permissions; updating this skill does not replace an active controller. A separately preserved matching controller may be used only after positive format identification and explicit authorization. Damaged current state is not automatically handed to a different controller for guessing.

## Author and review

Use current CLI help for exact options. JSON success responses have kind `command-result`, a command discriminator and typed `data`; human help and handoff retain declared text routes. Programmatic runtime APIs return their documented payloads; record-valued payloads retain their own envelope.

```text
node <skill>/scripts/harness.mjs draft --project ABS --id ID --goal TEXT --domain software
node <skill>/scripts/harness.mjs refs --project ABS --id ID
node <skill>/scripts/harness.mjs prepare-review --project ABS --id ID --handoff-only
```

Write the complete objective, all major stages, inputs and sources, permissions, resources, outputs, dependencies, acceptance, stopping rules and recovery. Each task has substantive phase mapping; shared protocols load conditionally. Review criteria explicitly declare requiredFiles, including an empty array where suitable. A generated skeleton or shape check is not a complete review package. Research requires its actual protocol and scientific reviews; blank text, unresolved placeholders and unexplained N/A cannot be sealed.

Authoring reads the same raw contract bytes for parsing and hashing. The documented prepare-review path renders the sole master, scans the complete current Markdown set and checks links per document, then seals only that exact contract/document version. Public prepareReview requires a current scan-binding; direct API use cannot omit the complete path scan. Contract, master, mapped documents, review attachments and bound file inputs share the review digest. Scan/seal drift requires a fresh scan, never a permissive fallback.

After reviewing the complete package, the final user directly approves/rejects/requests revision. Decision files use kind `decision` with actor=user, decision, taskId, revision, digest, message and source. The message/source must reflect a real user statement. Runtime recording is not authentication. Silence, initial task intent, another task's approval and an agent's self-assessment do not approve this version.

## Context, execution and actual end

```text
node <skill>/scripts/harness.mjs context --project ABS --id ID --task STEP
node <skill>/scripts/harness.mjs begin --project ABS --id ID --task STEP
node <skill>/scripts/harness.mjs submit --project ABS --id ID --task STEP --run-id RUN --executor codex-native --reference TEXT --result ok
```

Context is read-only: it checks current approval and dependency freshness, returns only mapped current document bodies, accepted dependency summaries, original active identity, latest acceptance/rework facts, blockers and applicable actions. Other reviewed phases remain digest-bound even when their bodies are not loaded. canBegin is a mechanical observation, not a reservation or extra permission. Returned bodies and hashes come from the same strict UTF-8 bytes and approved review binding. Concurrent control/review changes are refused with HARNESS_CONTEXT_SOURCE_CHANGED.

Begin requires current approval, verified dependencies and no active or ambiguous writer. It returns the original runId and complete host/mode/executor binding. The host then performs only the approved work. runId/revision/requestId/attemptId, hashes and host identities are current safety facts and must remain intact.

Actual end must be observed before submit. Timeout, tool return, a status label, post-spawn error or kill failure does not establish end. Unknown activity retains its original run and observer/handle and blocks another writer. Submit records ended work; it does not stop a process or authenticate the controller's account of native activity. Direct child close does not prove detached descendants ended; writer transfer still needs actual activity evidence. Spawned CLI work records process_observed without a final receipt or active release. The original controller observes actual business end and supplies --business-end-reference before same-run submit. This uses existing authority, without a new final-human approval per execution.

Eligible ok closure enters pending_acceptance; eligible failed closure enters failed. Approval/input/dependency loss permits only factual stale closure, never renewed approval or acceptance. Missing redundant task/cache fields can be recovered from a unique complete current begin and closure. Present conflicting review/executor/cache bindings block; no task-only, step-only or assumed-executor inference is used.

Inline submission constructs kind `submission`. File mode accepts only a current submission or an existing complete same-run receipt and is mutually exclusive with inline fields. Normal native work needs no separately authored payload file. Never author runtime-owned receipt destinations or state. The source input cannot alias the runtime receipt destination. Complete same-run replay is idempotent only when original path/hash, runtime bindings and all canonical caller facts, including nested extensions, agree. Conflicts or partial finals remain preserved and refused; replay cannot replace a later run or restore eligibility.

## Recovery and rework

If whole current state and a unique complete begin are trustworthy but the contract subsequently becomes malformed, structurally incomplete or semantically invalid, status/context API payloads return kind `recovery-context` (CLI responses use *data.kind* under the command-result envelope): original run/host/executor, damage diagnostics and no new-work or acceptance eligibility. New decision/begin/verify are blocked. After actual end, matching complete current facts may close only the original run as stale. Whole unknown/corrupt state instead preserves bytes, handles and diagnostics and stops control writes for manual recovery.

Changed closed pending/verified/stale artifacts require explicit rework before a repair run. Trusted closed historical runs can be administratively disposed through this interface after approval loss or task/cache removal. Stable original begin/closure/receipt remain required; administrative disposition does not restore approval or start business work. Rework binds the current original run, unique closure, receipt hash, reason/reference and requestId; it preserves previous facts and invalidates downstream acceptance. A new begin carries reworkOf. Failed execution has its direct retry route; it is not the same as rework of a closed accepted/pending/stale artifact. Never re-review, restart, delete a lock or rewrite state to clear active work.

## Plan revision after self-audit

Use [self-audit and complete replanning](replanning.md) for the reasoning and full replacement package. There is no separate replan command. Before changing bound plan content, preserve the readable old version and use the original controller to close actual ended work. `prepare-review` refuses active/ambiguous execution and unresolved eligible-ok closed-run obligations, even after stale/todo relabelling or task/cache removal. A bound passed acceptance or matching explicit rework resolves that obligation.

When an original result is factually closed and its original bindings/receipt are trustworthy, a justified `rework --project ABS --id ID --task STEP --run-id ORIGINAL_RUN_ID --reason TEXT --reference TEXT` preserves the prior facts and sets that item to stale; it does not approve a replacement. Settle all pending items before editing. Approval loss permits only administrative disposition of that trusted closed run. Conflicting records or unknown activity require recovery; do not cause drift or fabricate acceptance to bypass these guards.

With those guards satisfied, update the complete package under the same task ID, increment its revision, resolve references and run the complete prepare-review scan/seal route. The new review clears approval and rebuilds current task statuses as todo, while prior events and independent receipts remain. Preserve old plan text separately before replacement: hashes and events alone are not a readable archive. Reusable evidence still requires current acceptance; no old approval or verified status is inherited. Present the complete new version for direct final-user approval before context/begin.

## Review snapshots and acceptance

After actual work ends and submit closes its run, request a read-only snapshot for a declared review criterion. It binds task/revision/review digest, original run/receipt, criterion, prior acceptance attempt and recursive accepted dependency digest. Files are canonical project-relative path/hash/outputId rows covering every task output, requiredFiles and any explicitly added evidence.

Read the actual bound content and preserve the initial expected version. A snapshot says semanticReviewed=false; it provides no semantic verdict. Review records require verdict, reviewer, source, rationale, binding and complete files, with an honest independence claim. Serialized reviews/snapshots cannot be their own evidence; runtime controls, receipts, logs, immutable inputs and physical aliases are protected.

The reviews file is a complete `kind="reviews"` envelope with `records` keyed by criterionId. Its full original bytes are parsed and hashed together; wrapper/extensions and records are all rechecked, not only the unwrapped records. Review strings or filenames alone are insufficient.

Verify validates every review before any command, independent of criterion order. It then runs declared executable/argv with shell=false, observes actual end, saves logs and rechecks approval/state/receipt/source/logs/manifests/dependencies after each command and before final acceptance. Closed exit0 with control/log/timeout/protocol errors is failure. Artifact existence and process success do not establish semantic or scientific correctness.

Failure preserves the acceptance attempt, original run, report, raw process/exit facts and compounded errors. Applicable review criteria require a fresh snapshot and actual recheck after a failed attempt. Artifact changes require the appropriate rework first. Only all current mandatory acceptance makes a task verified; only every task verified makes the whole objective verified. Evidence drift invalidates affected results and downstream dependencies. Verified state requires complete output/receipt/passed-report evidence and original acceptance bindings. Missing, truncated or conflicting caches become stale and block downstream work, while another original active run retains its factual closure route.

## Optional local host CLI

```text
node <skill>/scripts/harness.mjs run --project ABS --id ID --task STEP --host HOST --executable LOCAL_ENTRY
```

Run owns its begin and terminal process observation; do not separately begin and then call run. Spawned work returns phase=executing, executionClosed=false, acceptedForVerification=false and processObservation, without a receipt. Observe actual task activity and relevant descendants ending, then submit the original run/executor/reference/result and --business-end-reference. Supplied process/log facts must match the observation. A proven not-started process may close automatically as failed. CLI begin records closureProtocol=explicit-business-end to distinguish protocols, without authenticating the controller. Older active work remains on its original runtime, even if a receipt file was published without its closure event. Complete old receipts whose original closure is already recorded retain exact replay compatibility. A complete receipt input never creates or recreates a missing final; a writer-boundary source loss reports HARNESS_SUBMISSION_SOURCE_CHANGED and preserves control bytes. Cached observations without their source event, or contradicting that event, require explicit recovery rather than cache replacement. It resolves an existing allowed executable, prepares only current approved context and sends stdin/EOF with explicit argv and shell=false. No downloads, provider enablement or second model call is implied. Preserve the reviewed original host even when closing after drift.

Codex, Claude Code and DeepSeek Harness have distinct [host profiles](hosts/codex.md). Read only the selected profile: [Claude Code](hosts/claude-code.md), [DeepSeek Harness](hosts/deepseek-harness.md). Actual model execution remains subject to user permission. DSH stdout is observed separately from stderr with fatal streaming UTF-8, complete session/turn/final rules and valid Unicode retained. Malformed decoding records protocol failure while the original observer waits for actual close; it does not throw from the callback to manufacture termination.

## Current installation and rollback

```text
node <skill>/scripts/harness.mjs install-preview --host HOST --host-home ABS --skill-root ABS --out PLAN
node <skill>/scripts/harness.mjs install --plan PLAN
node <skill>/scripts/harness.mjs rollback --manifest MANIFEST
```

Preview handles only the canonical current root and the exact source-inventory member set, including the inventory itself without a self hash. It captures actual content, ordinary single-link identity, canonical parent paths, reviewed host/profile, instruction/configuration roles, directory/container/anchor identity and observed metadata. Unknown members, linked targets, source/root overlap, unreviewed custom blocks and exact-before mismatches are refused. Personal instruction bytes outside the one current managed pair and configuration remain protected.

New transaction storage is atomically created with a protected Windows DACL allowing only the current user and SYSTEM, or verified POSIX owner/mode 0700. Plan, backups and journal temporaries are exclusively opened and remain empty until their fd/path identity, original private parent and effective permissions are checked; POSIX sensitive files use 0600. Collector capability, incomplete response, identity or security drift refuses before sensitive bytes. Existing host/skill/shared-parent and target permissions are preserved. Legacy transaction directories are not silently hardened or migrated; a write that fails current private-storage prerequisites refuses and preserves the original evidence.

Apply rechecks the same plan before preparation and inside shared host-home/skill-root locks. Transaction child and first journal are exclusive creations; unknown appearance blocks target writes. Subsequent journal publication binds the previously owned original, never a newly sampled replacement. Existing targets use verified in-place handles; new files are exclusively created. Plan, backups, operation intent/confirmed/failed facts and partial diagnostics precede or track real writes. Errors never imply all bytes are unchanged and never trigger blind automatic rollback/retry.

Metadata envelopes distinguish Windows owner/group/DACL, attributes and observed file/directory ADS from stat-only platforms. Named $DATA is a valid named stream. SACL/EA coverage is not claimed. Metadata helper JSON preserves raw stdout bytes for fatal decoding and binds request/result id, path, role, order and completion facts. Invalid helper output stays raw diagnostics, not valid metadata.

Rollback accepts only a complete current installed transaction bound to the original plan, backup paths/hashes/objects, target/configuration/metadata and complete directory/container snapshots. Prepared/partial/unconfirmed transactions and unknown changes are refused. All targets and all backup bytes are preflighted before the first restored byte. Record actual restoration prefix, directory removals and journal/control/cleanup failures; do not overwrite unknown versions or automatically retry partial restoration. Keep backups and original evidence for authorized recovery.

Regression diagnostics retain the existing results/pass structure and distinguish passed, failed and skipped. An explicit nonblank notApplicable reason produces pass=false, skipped=true and skipReason; tests=passed+failed+skipped. All-skipped is not execution success evidence, while a zero-case selection is an error. Typed case/result records keep optional legacy-compatible skip fields and reject contradictory counts or pass-plus-skip.
