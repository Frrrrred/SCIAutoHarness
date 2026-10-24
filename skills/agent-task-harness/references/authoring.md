# Layered packages: authoring, complete review and selective loading

## Choose the medium

For complex read-only work without file authorization, use a complete in-session package. Authorized files/machine state use the disk route. Both require complete planning and direct final-human review; one route's tools must not block the other.

### In-session package

Present stable ID/revision and complete current text: objective/non-goals, input identities/sources, read scope/rights, every major phase's methods/assumptions/dependencies, deliverables, acceptance, failure/stops/recovery and unknowns. Navigate by substantive conversation sections, not imaginary files/state/context. Formal results wait.

First verify cited local inputs read-only in authorized explicit directories: existence, project-relative resolution and real containment. Record actual unknowns/results. This is input verification, not disk-package path checking. Do not create a temporary package, call draft/prepare-review/check-harness-paths, or invent a machine digest without file authorization.

Present the complete version and await direct approval of its ID/revision/text. Record original user wording/source; initial requests, silence and parent self-approval do not count. Maintain current phase, accepted dependencies/evidence and next action in-session. Resume by restoring those constraints/approval, then current inputs, without repeating unchanged approval.

Later authorized persistence requires explicit conversion scope and complete disk creation/check/binding/review before formal use. Additional rights or material methods/scope require revision. Normal progress does not automatically authorize files.

### Disk authoring order

1. Complete actual result deliverables and dependencies in contract.
2. Immediately obtain draft's authoring.refs mapping.
3. Write all substantive phases/protocols/recovery from that mapping.
4. Semantically review the complete meaning, then prepare-review.
5. Normally deliver the complete pending package and wait for the final human.

Do not skip refs after reading an empty contract. Recovery uses its own mapping too. A project-relative input in backticks is not a link. Output-reference repair does not repair inputs. Prefer exact inputs.absoluteMarkdown in all documents; existing reference/markdown serve deliberate relative uses. Repair diagnosed inputs using their identity/absoluteMarkdown, never planned exemptions or changed bindings. Actually rerun until success and deliver normally, not only diagnostics/status.

For computational research trace promised result/code/data/figure chains before prose. Bind an actual declared rerun code path or script mode that rebuilds every mandatory output from raw inputs; existing code can do it. A reproduction ID pointing only to README/environment/receipt is insufficient. Assign execution ownership; do not turn result work into plan-only delivery.

Define the whole objective, sources, mandatory outputs, rights, actual tools and unknowns before major phases. Use real dependencies, not one file per call or fixed counts. Default task directory is project harness/<id>, keeping mutable records out of protected client settings. Existing .codex/harness/<id> stays in place. Dual locations require explicit identity resolution. Preserve existing IDs/paths and other tasks. Empty headings or future planning do not complete the major plan. Unknowns state blocked phase, required evidence and resolution route without invented values/tools.

## Master and phase content

Master: ID/revision, objective/non-goals, global constraints/rights, major products, dependencies, overall acceptance and phase-to-document map. No execution log. Own detailed rules once, in phase/protocol.

Every phase states requirement served/evidence/local quality exit or redirection; actual fees/capacity/operational rights (not duration); input identities/verified prerequisites; methods/assumptions; allowed reads/writes/ownership; substantive checks; next discriminating check and repair/retest/stops after failure; handoff meaning/paths/limits. Use [judgment](execution-judgment.md) as needed. Structural checks do not certify science.

Recovery starts with master/recovery → immediate context, deriving current authority/dependencies/phase; SCOPE/raw evidence follows only a stated gap. Put input links after this conditional route. Phases/protocols link the master and read inputs only after selection, without competing pre-context contract/state/history reads. Before sealing check all routes agree.

Review covers every major phase/protocol/recovery. Research phase selection follows actual goals (theory is definitions/proofs/counterexamples, not invented samples/training). Bounded reproduction does not force topic discovery. Before applicable research prose load [research](research.md), applying current source/version/raw integrity, parameter rationale, downstream checks and release evidence. Keep general rules in research.md; record task-specific constraints in phase or protocol documents. Do not add the Skill's reference files themselves to task contextFiles.

## Path bases and presentation checks

Tool cwd and contract paths use the user's explicit project. Markdown paths use each containing document. Do not copy master ../ depths into phases. Give master canonical absolute inputs; use actual links such as `[name](<literal path>)`, not commands/vague prose as references.

Before disk presentation actually run:

```text
node <skill>/scripts/check-harness-paths.mjs --project <absolute-project> --package <absolute-package>
```

This read-only scanner resolves inline file links/unambiguous single-backtick paths, reporting document/line/target/existence/errors. It is not a full Markdown parser, scientific check or approval mechanism, nor a reason for the model to reload every body.

Mark future outputs as planned and list repeated --planned project-relative paths; only those targets receive existence exemption. Never exempt current inputs/plans/recovery. Ownership/review remain in contract. Already authorized external inputs need explicit --allow-root; it declares scope, grants no permission, reads no input body and does not enable networking. Respect real containment.

Report pass only with ok=true and no uncovered items, retaining actual command/results and objective coverage. Complex titled/reference-style links, wildcards/placeholders or unsupported syntax must be replaced/rechecked. Fences, remote validity and anchor correctness are outside this scanner and need other checks. Pass does not certify undeclared references or meaning.

### Machine-managed authoring

Finish/check contract first, then use actual draft action:

```text
node <skill>/scripts/harness.mjs refs --project <absolute-project> --id <id>
```

It returns per-document input/output target/reference/Markdown maps read-only, without future bodies/files/approval. Reuse while path mappings remain unchanged. Write all documents using returned markdown/absoluteMarkdown, not hand-calculated depths/backticks. Independent planning documents can share a native tool call, but edit contract separately and avoid placeholders. Keep substantive phase-specific content and linked common constraints; batch write/nonempty is not review.

For partial/changed packages use refs --next. It reports missing/empty/present, next purpose/task/acceptance, scoped outputs/inputs and inherits links to master/applicable protocols. Write it, then ask for the next when useful. Present means nonempty; contentReviewed remains false. --document phases/actual.md selects a declared map and is mutually exclusive with --next; documents may not exist yet. External roots still need authorization/allow-root.

Before sealing, trace computations/figures to declared code or explicit real archive members. Declare required loose members; produce/accept archives before first consumption. A combined entry names covered steps. Inspect first-use/prior-freeze/review rules for data/dictionaries/config/code/evidence. Specify freeze relative to acquisition, configuration or viewing results. When material is unavailable, fix scientific principles/standards now; unknown actual groups/event codes need source verification, not guessed values or impossible pre-acquisition freezes.

After source audit establishes mappings, freeze dependent configurations before their use. Earlier principles must not depend on a later task supplying source facts. Do not turn before-analysis into before-materials without justification. Trace producers/availability backward; load shared rules before their first applicability. Advance-frozen artifacts need producers by that point, not later analysis owners. Prerequisites come from verified upstream; same-task artifacts require ownership and create-before-use. Acyclic graphs/output lists alone do not establish this chain. Correct prose and contract, then use draft's action:

```text
node <skill>/scripts/harness.mjs prepare-review --project <absolute-project> --id <id> --repair-output-refs --handoff-only
```

It repairs eligible output references, renders master, path-checks complete package and seals review. Planned outputs come from contract; external roots stay explicit. Failure returns nonzero/all issues/uncovered and review=null. Correct via refs and rerun this action; do not bypass with independent review.

Draft-only repair requires unreviewed/unapproved/unexecuted state and writer lock. Ordinary inline labels must name a unique output ID/filename; old target absent and only leading ../ depth differs. It changes the target only. Standalone single-backtick exact unique output project paths outside fences can become canonical links only if old document-relative target is absent. Returned outputRefRepair lists documents and document/line/old/new/output; backticks add syntax=single-backtick. Other text/newlines stay intact.

No guessing for inputs, input/output overlap, existing targets, remote/multiple-backtick/fenced/link-label code, commands, ambiguous or other errors. Without the flag behavior is unchanged; refs is read-only. A valid or prior review disables draft-only repair. Revised packages increment revision and use prepare-review without that flag, correcting links explicitly. refs --next's final action chooses arguments from real state; use them, not stale draft instructions.

Handoff-only emits complete Markdown only after success; normal JSON/repair facts remain available. Finish content review and repairs before sealing. Received success confirms master/contract/current digest binding, not substantive correctness. Normally deliver next without redundant full reread/handoff. Only a specific new defect justifies rechecking; genuinely lost results use recovery after actual original-call terminal state.

Success is pending_user_review, never scientific proof or approval. Handoff includes ID/revision/digest, contract/master/all navigation, real checks and final-human request. Deliver normally with literal Windows E:/ targets, never /E:/. Keep details in reviewed files. Generating text/starting scripts/exit0 is not actual receipt or final delivery. Interrupted calls retain original handles and actual state, not blind reruns. Legacy/non-machine packages retain separate render/path/review interfaces.

With valid review but lost result, establish original end, then read-only handoff --project ABS --id ID with authorized allow-root. It rechecks bindings/paths without render/review/state writes and refuses drift/missing/conflicts. Empty output and old success text do not prove current receipt.

## Machine contract and host policy

New drafts explicitly use numeric templateVersion4 in either layout. Hand-authored new contracts should too. Omitted/1 stays frozen v1;2/3 retain their own full bodies. Reading adds no fields or migrations. Layout and template selection are independent. Schema remains 1.

New execution.allowedHosts/defaultHost are reviewed. Draft --host selects default; repeated --allow-host adds explicit alternatives. Actual host references load conditionally: [Codex](hosts/codex.md), [Claude](hosts/claude-code.md), [DSH](hosts/deepseek-harness.md). Tools are host-specific. Old arbitrary execution data retains Codex semantics. Do not edit policy/version to clear activity/pending. Resolve them, increment revision and obtain direct-human complete review for deliberate upgrade. Stale closure restores no eligibility. See [template versions](runtime.md#master-template-versions).

```text
node <skill>/scripts/harness.mjs draft --project <project> --id <id> --goal <goal> --domain research --layout layered --host <selected-host>
```

Draft creates scaffolds and actual local command/args for refs/next/prepareReview. Complete all substantive documents before machine review. JSON examples illustrate fields; never overwrite draft's chosen template/policy with a fragment.

Update existing contract with an edit preserving the file; never delete/re-add it or replace the whole package in one brittle patch. Finish contract then individual documents. On patch failure inspect affected actual files and correct locally rather than assume success or repeat stale context. Incremental authoring does not grant incremental approval. Preserve IDs/paths when adding phases, and generate master through render/prepare-review.

```json
{
  "layout": "layered",
  "recoveryFile": "RECOVERY.md",
  "contextFiles": [
    {"path":"phases/source.md","kind":"phase","tasks":["source"],"purpose":"Source and data definition","loadWhen":"Entering source"},
    {"path":"phases/analysis.md","kind":"phase","tasks":["analysis"],"purpose":"Analysis and counterexamples","loadWhen":"Entering analysis"},
    {"path":"protocols/method.md","kind":"reference","tasks":["analysis"],"purpose":"Method and applicability","loadWhen":"Method needed"}
  ]
}
```

This is incomplete. Keep actual tasks/deliverables/inputs/permissions/acceptance. Every task maps to a phase; coherent tasks can share one. Context/recovery are automatically digest-bound even absent reviewFiles. Use in-package relative Markdown, not control evidence/outside/duplicate physical identities. Research inapplicability needs specific reason/evidence, not empty/UNKNOWN. Immutable inputs bind path; generated approved data/results are outputs, not expected-to-change initial inputs.

### IDs, artifacts and acceptance

IDs are real strings, lowercase-letter start, lowercase/digit/hyphen,1–64 chars. No coercion of booleans/arrays/objects/numbers. Inputs and outputs require distinct normalized/case/real/dev-ino identities; hardlinks cannot disguise originals. Equal independent bytes are fine. Unreliable multiply-linked identities reject.

Review attachments in both layouts exclude runtime state/locks/receipt/acceptance/check/execution evidence and aliases. Master/contract already bind and cannot be repeated. Ordinary nested attachments remain supported.

For required proofs, declare definitions, actual complete proof and manuscript files with owning tasks. Proof depends on accepted definitions, manuscript on verified proof. Criteria are objects; research has review. Proof acceptance reads definitions/quantifiers/all assumptions/derivations/boundary cases and evidence positions. A plan/lemma/file/command/DAG does not replace formal proof or unlock established manuscript claims. Preserve unresolved conjectures/counterexamples. Other research uses actual matching criteria, not mechanical proof phases. Trace production → substantive acceptance → consumption before review.

Every input requires real source; path additionally binds actual local existence/hash. Description/id do not substitute. Example SCOPE must exist and be read, or be replaced/removed, never fabricated. Finish contract→refs→documents→prepare-review; correct all diagnostics. Normally return full pending navigation/checks to the final human and wait, not a request for the parent to write/approve or formal results.

## Enter a phase

```text
node <skill>/scripts/harness.mjs context --project <project> --id <id> --task <step>
```

Context checks whole binding read-only but emits selected phase/protocols, global constraints, current acceptance and verified dependency summaries, not future bodies/history. Resolve blockers; reading is not authority. Native and independent layered execution share this route. Select only reviewed allowed hosts; do not assume portable tool names. Read raw evidence for a specific gap. Recheck approved boundaries before work; normal progress needs no new approval. Selective loading reduces repeated execution/resume reads, not necessarily total tokens/time.
