# Local runtime interface

Use `node <skill>/scripts/harness.mjs help`, quoting paths for the actual shell. Use the supplied local Node entry; do not add npx, dependency installation or a second orchestrator to operate this runtime.

These commands operate on disk packages. Without file authorization, use the complete in-session review and recovery route in [authoring](authoring.md); do not invent disk state, a machine digest or CLI context. Pending-review handoffs below concern a new package or substantive revision. An independent read-only delegation under the same valid approval inherits the original task through [context hygiene](context-hygiene.md).

Load only the actual host reference: [Codex](hosts/codex.md), [Claude Code](hosts/claude-code.md), or [DeepSeek Harness](hosts/deepseek-harness.md). Host selection grants no tools, permissions, model access or resource budget.

## Author, review and resume

New packages use the ordinary project directory `harness/<task-id>/`. Existing `.codex/harness/<task-id>/` packages remain in place. The runtime refuses an ID present in both locations; do not hide an old approval or receipt with a new package. Respect actual host restrictions, including Codex protection of an existing `.codex` directory. A refused old-package write is a block, not permission to elevate or arrange a bypass writer.

### Prepare the complete review package

1. Run `draft --project PATH --id ID --goal TEXT --domain research --layout layered`. Choose the actual domain (`software`, `research` or `general`). New template 4 uses `--host HOST` for its reviewed default and repeated `--allow-host HOST` for alternatives. Omitted options produce Codex-only policy. Omitting layered layout retains legacy layout with the current new-draft template.

   Read [authoring](authoring.md) and complete the contract, contextFiles and recoveryFile. Each task needs output ownership, dependencies and substantive acceptance. State actual applicability for research protocols. Draft returns actual local command/args in authoring.refs, authoring.next and authoring.prepareReview; use those actions rather than copying runtime functions or creating another wrapper.

2. Once the initial contract is complete, prefer `refs --project ABSOLUTE_PATH --id ID` to obtain the whole canonical reference map. Reuse it while the contract and paths are stable, then write all substantive major documents. Independent bodies may be written in one native call; avoid empty shells or an opaque patch combining contract changes with unrelated document creation.

   Use `refs --project ABSOLUTE_PATH --id ID --next` for partial authoring or a changed map. Its inherits links identify the master and applicable protocols. A phase supplies inputs and prerequisites, methods and assumptions, outputs and ownership, acceptance evidence, failure handling and handoff. No fixed length or file count substitutes for substance. Refs is read-only: missing/empty/present does not certify quality. Whole-package and `--document PACKAGE_RELATIVE_MD` modes remain available; next and document cannot be combined.

3. Review completed content, then prefer the returned action `prepare-review --project ABSOLUTE_PATH --id ID --repair-output-refs --handoff-only`. For an unreviewed draft it combines restricted output-link repair, rendering, the documented path check and review sealing. Use canonical references while writing, rather than postponing all correction. [Authoring](authoring.md) defines repair limits and itemized reports.

   The entry without repair remains available. Repair is limited to an unreviewed draft. For an existing successful review whose return was lost, use read-only handoff. Refs and prepare-review accept repeated `--allow-root AUTHORIZED_ABSOLUTE_ROOT`; actual authorization must already exist.

   Invalid contracts do not overwrite the master. Path failure returns nonzero, issues/uncovered and review=null. Correct references and obtain an actual successful recheck; editing or skipping the check is not a pass. Success enters pending_user_review and binds the complete package, including phases and recovery. ReviewFiles can bind necessary planning attachments, not state or receipts. A digest establishes neither semantic/scientific validity nor human identity.

   Successful handoff-only returns complete pending-review Markdown; failure retains diagnostics and nonzero status, and normal JSON remains available. Successful text confirms that the master matches the contract and is bound to the current review. Once actually received, deliver it normally. Do not reread solely to reconfirm synchronization, automatically repeat whole-package semantic review after sealing, or repeatedly call handoff without a specific defect.

4. Present the final human with the complete current ID, revision, digest, master, all phase/protocol/recovery navigation, real path-check result and pending-review status. A delegate returns this normal complete handoff, without asking its parent to write or approve it or doing formal work while approval is pending.

5. After the actual direct human decision, record it through `decision --project PATH --id ID --record FILE`. Fields are actor=user, decision=approve|reject|revise, taskId, revision, digest, message and source. Preserve actual message and provenance. No reply means no approval to record. Caller-supplied records do not authenticate a person.

### Resume through context first

For a supplied existing entry, first project reads are only its master and recovery. The skill runtime interface may be read, then immediately call `context --project PATH --id ID --task STEP`. Even explicitly named SCOPE, README or task descriptions come after context as needed. Before context, do not enumerate/broad-search, load full state or read predecessor reports; matches count as loading. An unknown or actually missing entry permits only narrow filename lookup in the supplied task directory.

Context returns current-phase bodies, applicable protocols, global constraints, acceptance, approval/dependency summaries and blockers. It does not load future phases, full contract or history. Layered review.approval includes actor/decision/task/revision/digest and message/source excerpts, each at most 512 characters, with truncation flags. Without current approval it is null. Interpret it alongside actual user authorization; do not reread an old ledger just to reconfirm supplied evidence. Follow raw links for a specific gap.

CanBegin checks declared mechanisms, not permission. After begin, false prevents duplicate execution; it does not revoke the original run's approval. Optional host selection applies to new work. Active context preserves the original host/mode/executor and review binding. Inspect global.execution, activeExecutions, executionBlockers and returned workflow actions rather than relabeling the run.

### Choose one execution route

**Native work:** `context → begin → actual work and confirmed end → returned inline submit → verify`.

`begin --project PATH --id ID --task STEP [--host HOST]` returns the actual runId and binding. Layered and template 4 tasks also return the inline submission command/args. Use available native tools, then append truthful `--reference "ACTUAL_EXECUTION_LOCATION" --result ok|failed`. Optional summary and outcome values are negative, opposite, inconclusive, positive or not-applicable. Illustrative fields are not evidence.

**Independent CLI work:** `context → run → inspect actual closure and receipt → verify`.

`run --project PATH --id ID --task STEP [--host HOST] [--executable LOCAL_ENTRY] [--timeout-ms N]` resolves the selected local entry, begins its own CLI-mode run, prepares approved input, launches/observes it and submits actual end facts. Do not call begin before run. An existing active run is not a slot for a second invocation. The child receives the already-begun identity. It must not begin another run or submit or verify this run itself; the supervisor records factual closure after the child actually closes.

Normal inline submission needs no payload JSON. Runtime alone creates the formal receipt. Use help submit or submit --help for the dedicated interface. Legacy receipt-file input remains available as an independent payload; it cannot mix with inline fields. Reserved receipt-<runId>.json/state.json or their physical aliases cannot be sourceFile. A conflict is refused without moving/deleting the input.

An eligible first ok submission enters pending_acceptance; an eligible failed submission enters failed. An ineligible original run can close factually while remaining stale. Exit zero alone establishes none of these transitions. `verify --project PATH --id ID --task STEP [--reviews FILE]` checks approved criteria. Only current complete evidence establishes verified, and dependencies must be verified. Output/receipt/log/report drift makes affected tasks and dependents stale. Ordinary declared output/progress changes do not change plan approval; immutable input or reviewed-specification drift does.

### Context files and revised review

ContextFiles use package-relative Markdown paths, with path, kind=phase|reference, tasks, purpose and loadWhen. RecoveryFile belongs to the complete review but is loaded via recovery rather than by loading every phase. Inputs[].path may bind an actually authorized external file or controlled manifest, without write permission. A large-data manifest hash is not per-member validation. Future/changed work belongs in outputs, not immutable initial inputs.

Reuse a stable whole refs map; use next for partial work. For an already reviewed package, use the closing action returned by refs --next: it preserves state protection and omits draft-only repair. Increment revision, finish substantive changes, render/review without repair and obtain direct approval. Do not delete state or pretend to be a draft. Write missing bodies separately at existing paths; inserting one phase does not require renaming the package. Renderer synchronizes the master.

HandoffMarkdown can be used in the normal final reply with current review identity, full navigation and human-review request; details remain in reviewed files. A real defect needs correction and re-review. Generated Markdown or machine sealing alone is not final delivery. Corrected references still need actual recheck/current review. An issued interrupted call means started/result-unreceived, not unrun/passed. Preserve its handle and recover the real result. A parent's later check does not replace the delegate's complete handoff.

## Host policy and execution identity

Template 4 adds a reviewed policy. The following illustrates all supported IDs, without granting permission to use them:

```json
{"execution":{"allowedHosts":["codex","claude-code","deepseek-harness"],"defaultHost":"codex"}}
```

AllowedHosts must be a nonempty unique array of supported IDs; defaultHost must be a member. Declare only actual authorized choices. Missing/1/2/3 templates retain effective Codex-only policy even when old arbitrary execution data exists. New semantics cannot be activated by adding that key to an old template. A reviewed policy/template change requires revision and review.

| Host | Native executor | CLI executor |
|---|---|---|
| codex | codex-native | codex-cli |
| claude-code | claude-code-native | claude-code-cli |
| deepseek-harness | deepseek-harness-native | deepseek-harness-cli |

These six executor values are closed. New begin persists version=1, host, mode=native|cli and matching executor. Native and CLI bindings are not interchangeable. Submission for a bound run must match its original executor; another host/mode cannot relabel it. Conflicting trustworthy bindings block recovery rather than choosing the latest. Old unbound runs retain original Codex fact rules only, never caller-invented non-Codex identity. Current settings, active caches or desired executor cannot fabricate a new binding.

Policy drift does not erase an active identity. Observe the original run and submit its original facts only after real termination; loss of approval/dependencies makes factual closure ineligible, without restoring either.

## Active runs and factual recovery

Active identity is independent of output freshness. State/context activeExecutions preserve step/runId/original review and execution bindings. ExecutionBlockers reports legacy histories that cannot safely be paired. Upstream drift can invalidate evidence/approval without ending execution. Begin refuses duplicate/conflicting starts; review/prepare-review refuse active and pending work, so they cannot clear it.

### Shared active-execution gate

Begin and verify share the active/ambiguous execution gate. Verify first refreshes normally, including checks of previously verified evidence, then gates before this attempt's receipt/artifact/review checks or any command criterion. If B remains active, A's request is refused with HARNESS_ACTIVE_EXECUTION and original location, for every criterion type.

The existing locked mutation path records criterion=execution-guard failure, null log/exitCode/processResult and empty checks/evidence. This is a control record, not proof the requested acceptance began; refusal does not promise unchanged state bytes. Original receipts/history, valid prior acceptance and other active identities remain. A verified task is not revoked solely by refusal; actual drift can still derive stale. Failure to acquire a lock creates no attempt and never releases another holder's lock.

The gate does not wait under lock for the old process. It is not inserted into submission, decisions or every mutation. Launch validation allows the already-begun run's own expected identity.

### Original-run closure and receipt replay

After actual termination, submit original step/runId and truthful reference/result. Only current eligible approval/run/dependencies permit acceptedForVerification=true. Ineligible or orphan closure returns executionClosed=true, acceptedForVerification=false and stale, without restoring approval or validating old artifacts. Closing an old run does not overwrite a different current run. Submit does not stop, cancel or kill a process.

Same-run replay recovers a complete final receipt published before its state pointer committed; it does not repeat the work. Runtime writes and closes a unique same-directory temporary file, then publishes by exclusive hard link. Unsupported publication fails explicitly instead of overwriting via rename.

When final is complete, supply the same facts in the original mode. Reuse native inline fields. CLI/file-mode receipts with process/logs/extra facts need a separate input payload or direct API object preserving every caller fact. Final and aliases cannot be sourceFile. Normal inline native work needs no new payload.

Checks cover fixed receipt location, task/step/run, original review/execution binding, stored hash and canonical caller facts. Key order does not matter; extra JSON facts do. Active replay can close factually and recheck current eligibility. Unknown original approval permits only stale closure. Closed identical replay returns replayed=true without rewriting final, adding another closure event, downgrading valid verified work or replacing another run. A stale-closed run cannot regain eligibility when prerequisites later recover.

Reference/result/outcome/summary/process/logs or other factual conflicts, incorrect identities/review bindings, bad or partial final JSON and bound-hash mismatch preserve originals and refuse replay. Do not delete final, edit state, clear active or review around it. Temporary cleanup failure retains original error, publication status and paths. Complete final plus its own same-inode temporary remnant can still recover; real end evidence remains required.

Original review digest derives only from same-run explicit begin, same-run old task, or closure with recognized runtime provenance. Old active caches cannot authenticate it. Unknown remains null; receiptReviewDigest is an observation, not an approval source. Matching old facts can close stale. A known original digest conflicting with a different nonempty final digest is refused. No reliable binding or no original acceptance eligibility means no promotion. Optional reviewBinding provenance and execution bindings are additive records, not automatic migration.

SchemaVersion remains 1. Legacy events are interpreted in order. A receipt lacking runId closes only when that step had exactly one candidate then; ambiguity stays blocked without guessing or clearing. Status/context derive read-only; normal mutations persist actual refresh/results.

## Master template versions

Contract.templateVersion is separate from schemaVersion. Missing or numeric 1 uses frozen complete v1. Numeric2/3 retain their respective complete frozen masters. New drafts explicitly use numeric 4 with reviewed host policy and neutral instructions. Both layouts obey the selection. Missing-version interpretation does not insert/reorder fields, alter old master or rebind approval.

Historical v1 receipt/exit-zero shorthand describes eligible normal successful first submission. Actual failure, stale and replay behavior follows this runtime. Templates 2–4 and current help explicitly distinguish those branches. Renderers and validation accept only numeric 1/2/3/4, rejecting other values/types; they do not guess from prose or accept an arbitrary old/new body. Entire master must match its selected contract and review digest.

For an already reviewed unsupported template, status/context retain diagnostics and original active identity. New formal actions lose eligibility; a truly ended original run can still close stale. Reading cannot seal off factual recovery.

Unchanged missing/1/2/3 approved, pending_acceptance, verified and active packages continue under original Codex semantics without new review. Changing templateVersion, even adding1 to an omitted version, changes reviewed bytes: finish pending acceptance/close active work, increment revision, render, review complete revision and obtain direct approval. No automatic migration, inherited approval or rebound old verification. Abnormal mid-run changes preserve identity but closure does not restore eligibility.

Older runtimes may not understand template 4; never remove its version or forge an older master to revive approval. Use a supporting runtime. Render refuses symbolic-link master, validates scope and atomically replaces it; hard links are replaced instead of rewriting external targets in place. Review/prepare-review compare output identities with control/reviewed/evidence files and reject aliases. These observed filesystem checks are not OS isolation or protection against every malicious concurrent relink.

## Acceptance failures and process supervision

Failed verify also retains acceptanceAttempts and lastAcceptance: criterion, actual error/log/exit or null, report, receipt and next action. Successful retry appends rather than deleting failure. Attempt status describes the invocation, not full current state. Context.acceptance supplies latest summary/pointers rather than logs/history; interpret with currentStatus. Latest acceptance failed and currentStatus verified can coexist.

Failure never establishes a new verified result. Pending work with failed preflight/criteria cannot pass; preserve actual nonzero/spawn/log failures and fix the cause. Refused repeated acceptance of previously verified work does not itself revoke current prior evidence. Approval, dependencies and refreshed old evidence still determine state. If report/state writes are refused, report real errors rather than promising persistence. Use [recovery](recovery-maintenance.md) to choose re-verification, rework or continued valid acceptance.

Failed execution-guard report writing retains reportError and original recovery.acceptanceReportError, including when state saving or lock release also fails. Judge report, state and lock outcomes separately; an unwritable record is not durable.

Process results separate not-started/closed from original exitCode/signal/pid, timedOut, outputBytes and control/log errors. Post-spawn error, kill=false, thrown kill or EPERM does not prove termination. RunProcess observes actual close; run cannot submit early/release active. Unknown termination preserves unknown-active. Timeout policy code124 is distinct from raw exit/signal. Control of the directly spawned child establishes nothing about detached descendants.

Log open/write/close and synchronous spawn cleanup settle through controlled errors retaining processResult. Cleanup cannot erase actual close or create unhandled rejection. After real end, log-digest failure produces failed facts without an invented hash. Acceptance reports retain raw process facts and context points to the latest report. Without close keep observing the same call, without a second writer/background observer.

### Final launch guard and closure persistence

Run opens log exclusively, then before spawn constructs actual prompt and checks original runId, trustworthy review, current approval, dependencies, execution binding and actual bodies. Both layouts share this guard. Own-active canBegin=false is normal. PrepareInput is an optional internal callback, with no CLI bypass. Existing task lock covers read/final check/synchronous spawn, then releases launch lock.

Cooperating decision commands cannot commit during the locked check. A refused concurrent decision did not take effect; handle its actual result. Post-spawn lock cleanup failure still waits for real close, never not-started/restart. This is a checked boundary, not atomic sandboxing. Pre-spawn preparation failure records not-started with any log-close error. Begin save/cleanup failures also prevent launch: associate only this beginCandidate/completed result, check actual on-disk identity, never substitute latest unrelated run.

Preparation/execution failures use the same factual submit route. If contract/state/lock/disk prevents closure, retain original runId/reviewDigest/processResult, stable submissionFacts and separate closureError. Do not claim executionClosed without durable closure. Original submission JSON can replay through API; do not add closureError to execution facts. Publication, state and outer-lock errors can coexist: preserve all and actual publication. No unwritable disk persistence guarantee is possible.

## Local CLI adapters

Independent run requires authorization for additional local/model execution. Native work or permission to inspect a CLI does not implicitly authorize another model call.

| Host | Local entry | Run argv after any resolved entry prefix |
|---|---|---|
| Codex | codex | exec --sandbox workspace-write -c approval_policy="on-request" --skip-git-repo-check --json - |
| Claude Code | claude | -p |
| DeepSeek Harness | dsh | --profile headless --json - |

These are argument profiles, not shell snippets; Codex approval_policy="on-request" is one argument with no literal backslashes. Prompt is stdin followed by EOF. Follow host references for prerequisites and live-evidence limits. Profiles do not prove arbitrary client versions/accounts work, and their permission mechanisms are not equivalent.

No persistent model selection, CLI download, fallback host, provider configuration, bypass flag, GUI/server or conversation-resume side channel is introduced. Exposed executable selects a local entry, not a policy override. Codex-only --codex alias cannot mix with --executable. Claude/DSH shell shims resolve through matching official local package metadata and a real contained native/JS bin; unsupported/escaping entries fail. No shell is launched. Original Codex resolver remains.

Doctor with optional host/executable performs version/help only, without a model, installation, authentication guarantee or end-to-end model claim. Its Codex alias has the same restriction. Use timeout only from actual resources or timeout-ms; control covers direct child only. Runtime does not replace OS isolation, network/install rules or authentication.

### DSH terminal stream

After actual close, DSH additionally checks UTF-8 stdout NDJSON, including split multibyte chunks and a final line without LF. Stderr remains raw diagnostics. Recognized types are session/status/text/thinking/tool_call/tool_result/final/error. Malformed JSON, nonobject/unknown event, ordinary event before session, duplicate or empty sessionId, nonstring final text, events after final, missing final or missing/noncompleted last turn_end fail. Turn_start clears the previous completion reason. Any error event fails; valid terminal final must be last and the last ended turn completed.

HostProtocol retains observed counts/terminal state/errors. Bad stream becomes execution failure even with exit0; raw exit/signal remain unchanged. Nonzero, control and log failures also remain failures. Parsing neither cancels the process nor replaces actual close or semantic acceptance. Source/fixture checks do not establish live DSH discovery, credentials/provider or model execution; report unperformed live validation explicitly.

## Command returns and final delivery

Use actual host command tools and retain complete structured return, exit and continuation handle. Empty output with a handle means continue that call, not restart. The following is conditional on a host actually exposing functions, exec_command/write_stdin and store/load; other hosts use their own supplied interfaces.

```javascript
const result = await tools.exec_command({
  cmd: 'ACTUAL_AUTHORIZED_COMMAND', workdir: 'AUTHORIZED_ABSOLUTE_PROJECT',
  yield_time_ms: 1000, max_output_tokens: 12000
});
store('harnessCommand', result);
text(result);
```

Returning only output discards essential status/handle facts. Resume a real running session:

```javascript
const previous = load('harnessCommand');
if (previous?.session_id === undefined) throw new Error('No running session.');
const continued = await tools.write_stdin({
  session_id: previous.session_id, chars: '',
  yield_time_ms: 1000, max_output_tokens: 12000
});
store('harnessCommand', continued);
text(continued);
```

Retain updated handles until definite terminal exit and actual output. If functions itself returns Script running with cell ID, continue with its matching wait first. Bound observations by actual task budget/interruption rules, without infinite polling. Without handle or complete result, mark unconfirmed and inspect original termination before retry.

Do not blindly rerun prepare-review. If current valid review exists, handoff reads its Markdown without resealing. Correct actual drift/requirements then re-review when needed. Preserve final literal absolute links: E:/ is a Windows drive path, not /E:/. Check all navigation, ID/revision/digest and final-human review request, then deliver normally. Exit0, a state file or generated text cannot replace receiving actual results and final delivery.

## Acceptance types and limits

Artifact outputs are ordinary files. Declare necessary loose members or a real archive. Hashes bind bytes, not archive completeness, executable behavior or content validity; command/review criteria check those. See [artifact examples](artifact-examples.md).

Commands require explicit executable and string args, without shell expansion. Actual logs/exit are retained; timeoutMs/failureAction are optional. Side effects still need authorization. Bind important check scripts as reviewed inputs/attachments when their identity matters.

Review records are keyed by criterion ID with verdict=pass, reviewer, source, rationale and real project evidence files. Report actual independence; missing independence is not a claim of independence. Records cannot certify semantic/scientific validity automatically. Research needs review evidence per task; mechanical phases may focus on provenance/quality without pretending separate personnel.

Status derives current evidence with persisted=false, without writing state. Old state.json alone is not current verified evidence. Contracts, reviewed attachments or immutable inputs with substantive changes require revision/render/review/approval, retaining old evidence without rebinding.

## Locks and cleanup diagnostics

A task lock is released only if acquired, with one normal release attempt. Successful release returns original result or rethrows original action error. Release failure raises LOCK_CLEANUP_FAILED with lockPath, actionStatus, cleanupError and either actionError or completedResult. Failed action does not mean no partial write; completed means callback finished, so CLI nonzero can accompany completed work. Inspect actual result/errors/locations instead of auto-retrying/clearing locks. API exceptions retain original objects even when cycles cannot be JSON serialized.

Installation locks canonicalize/deduplicate all roots and acquire in stable order (case-normalized on Windows). Only acquired locks are released, in reverse order, trying every acquired release even if one fails. LockRoots/cleanupErrors preserve acquisition/release facts alongside original action/error/result. Home and shared skillRoot both participate, including different-host operations. These locks coordinate cooperating runtimes, not arbitrary processes or OS permissions; quiesce older writers that do not participate in shared-root locking.

## Installation and rollback

### Exact preview before mutation

Run the nested portable CLI from the chosen source. `install-preview --host HOST --host-home HOME --skill-root ROOT` is readonly unless `--out FILE` is requested; that option exclusively creates its preview file. Roots are explicit, and skillRoot is the parent of all three fixed skills. The Codex-only --codex-home alias cannot be combined with --host-home. A preview neither applies changes nor grants permission.

New previews use safetyVersion4 and bind source, host/home, instruction filename, three roots, file identities, relevant directory identities and exact changes. The formal skill is sciautoharness, displayed as SCIAutoHarness. agent-task-harness and codex-task-harness are six-file explicit-only entries directly to the same engine. They hold no task state or approval.

Review the exact plan before `install --plan FILE`. Different installed content needs --replace-skill in a fresh preview; a recognized full source also needs --migrate-legacy. Unknown inventories, extra files, linked roots or unreliable identities refuse automatic migration. A nonempty Codex AGENTS.override.md or the named local instruction source of another host requires review. Models, provider settings and unrelated configuration are not changed.

### Rules and original objects

Managed instructions accept exactly one complete known marker pair; mixed, duplicate and malformed forms refuse. Default generated rules can migrate to the formal rule. A custom rule requires the separately approved exact `reviewedRule:{before,after}` API input. The after block uses sciautoharness markers. The full before/after belongs to the preview digest. Preserve outside bytes and all substantive user policy; the CLI does not infer a custom patch.

Before mutation, apply rechecks the preview under home and shared skillRoot locks. Ordinary files must be single-link with reliable identity. Existing targets use verified handles and retain their objects; new files use exclusive creation. Original bytes, owner/ACL/NTFS streams are not deliberately replaced. These checks are not OS isolation against arbitrary concurrent actors.

A recognized full source has an exact inventory and original identities. Originals move by same-volume rename to numbered slots at dirname(skillRoot)/.sciautoharness-rollback/UUID outside discovery. EXDEV has no copy/delete fallback. Backup and prepared intent precede changes; confirmed directory creation, original moves and writes are journaled. Existing directories are retained. Source/target or directory drift needs a fresh review.

### Completed rollback and historical formats

`rollback --manifest FILE` needs explicit authorization and a completed matching installation. All targets, roots, directories, source inventories and backup slots preflight before the first restored byte. Linked or replaced roots refuse even when their files retain matching bytes and inodes. Only directories actually created by this installation are eligible for cleanup. Original files return by rename where retirement was used; existing changed files restore through verified handles. Backups and journals remain.

The dispatcher retains fixed original safety1,2,3 readers, products, roots, role checks and retirement storage. Historical records are never relabeled or filled with new fields. Restore migration4 first, so the prior3/2 record can recognize its same original objects; then use that earlier record under its own authorization. A preview is not a rollback manifest.

Prepared, partial or unconfirmed operations refuse automated rollback. An error can follow partial mutation or even successful work with lock cleanup failure. Keep actual process end, error, completedResult, manifest and journal; diagnose before another operation. Do not blindly retry or delete a lock. Recovery stages identify confirmed facts and the failed logical target, not a transaction guarantee. Stale factual closure does not renew task approval or acceptance.
