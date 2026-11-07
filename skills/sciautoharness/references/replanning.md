# Self-audit and complete replanning

Use this branch when evidence challenges the plan's feasibility, progress repeatedly fails to advance mandatory acceptance, a critical dependency remains blocked without a viable path, or the user identifies persistent failure or drift. Existing tasks first follow master/recovery → context. Start with current acceptance and dependency summaries; inspect original plans, decisions and execution evidence only to answer identified gaps. Comprehensive coverage does not require loading the entire history.

## Recognize when local correction is insufficient

Escalate from the [revision drift check](execution-judgment.md#revision-drift-check) when a consequential assumption is refuted, repeated substantive rounds yield no decision-relevant evidence, the same failure returns despite patches, or local work displaces critical delivery. Assess slow progress against the critical path, evidence gained and remaining acceptance, rather than a fixed duration or retry count. Normal waiting, one timeout, or a valid negative result alone does not establish infeasibility.

Stop adding attempts on the affected route while auditing it. Preserve original observers, process handles and ownership; uncertainty about termination still blocks a second writer. Continue independent mandatory work within existing approval when its prerequisites remain valid.

## Reconstruct the baseline and audit the whole task

Recover the original user objective, every mandatory deliverable, hard constraints, permissions, resources and technical or scientific acceptance, with their sources and actual approval. Separate user requirements from methods, sequencing and assumptions chosen by the old plan. Only the user can remove a core requirement or relax a hard constraint; preserve them while reconsidering the means.

Compare the planned route with actual evidence:

| Review area | Required question |
| --- | --- |
| Outcome and critical path | What remains unaccepted, which dependency controls delivery, and where does the blocker propagate? |
| Feasibility | Do available inputs, tools, capabilities, resources and permissions support the proposed method? |
| Execution and organization | Is the failure an implementation defect, an invalid method, an external dependency, or unnecessary decomposition, coordination or repeated local refinement? |
| Evidence and acceptance | What has been established or refuted, what remains a hypothesis, and do the checks actually test the user's objective? |
| Scientific/data validity, when applicable | Do source lineage, units, assumptions and domain failure modes still support downstream use? |
| Existing results | Which results remain applicable, which are invalid, and which dependents require renewed evidence? |

Distinguish those failures from ordinary exploration and valid negative or inconclusive results. For competing explanations use the relevant branch of [outcome-oriented work](outcome-oriented-work.md) to choose a discriminating check, rather than repeating the same attempt.

## Turn lessons into a decision

For each consequential lesson, identify its factual source, the earlier assumption or decision, the supported cause or still-unconfirmed explanation, the proposed plan change, and the evidence that would demonstrate improvement. A generic reminder to be more careful is not a plan change.

Choose the smallest adequate response:

- Continue the reviewed route when it remains viable and is producing necessary evidence.
- Repair or reprioritize locally when the method and acceptance remain valid; use the existing retry/rework rules.
- Rewrite the complete Harness when feasibility, the major method or the dependency structure no longer supports delivery. Do not stop at rearranging the next action.
- If the objective and hard constraints cannot be satisfied together, state the exact conflict, decisive evidence and smallest choices for the user. Replanning cannot manufacture feasibility, permissions or a successful outcome.

Record this judgment and lesson-to-change mapping in the existing authorized progress/revision record, or in chat when no persistent record is authorized. Preserve the scope and uncertainty of lessons; task experience does not authorize changing global skills, memory or policy.

## Prepare a complete replacement

Retain the original task lineage and preserve the old plan text, contract/revision and relevant execution evidence before replacing reviewed content. Use an authorized task-local archive outside the live reviewed document set, or the complete session record for session-only work; preserve source versions and negative findings. An event digest alone does not preserve the old plan's readable substance.

Follow [authoring](authoring.md) to produce a complete current master, all substantive phases, applicable protocols, recovery, inputs, permissions, resources, deliverables, dependencies and acceptance. Include:

1. How every original objective and hard constraint is retained, and any explicit unresolved user decision.
2. Which assumptions, methods or dependencies change, why, and which actual lessons drive each consequential change.
3. Which evidence can be reused and why it still applies; invalidated results and downstream revalidation requirements.
4. The new critical path, first discriminating evidence, stage exit/redirection conditions and remaining blockers.

A change summary does not replace the complete package. If another rewrite retains a refuted assumption or supplies no new testable route, identify the missing evidence or real user decision instead of cycling through plans. Continue other authorized mandatory work where possible.

## Close original work before sealing a revision

Keep the controller that began the original run, its host/mode/executor and actual handle. Updating this skill is not permission to switch an active controller. Submit only observed ended work under its original identity; submit itself does not stop a process. While activity is unknown, perform read-only diagnosis and draft separately within existing authorization; leave the live bound plan unchanged and do not seal a revision to clear activity.

For file-backed tasks, use the existing [runtime](runtime.md#plan-revision-after-self-audit), not an invented replan command or new state field:

1. Before changing the old plan, preserve its readable version and settle all actual active or ambiguous execution. Close the original ended run with its actual result and evidence.
2. If a result is factually closed and its original begin/closure/receipt are trustworthy, use a justified `rework` request against that original run. It preserves the previous closure, receipt and acceptance facts and sets the item to stale. Settle every pending item through supported operations before editing the plan. Do not intentionally cause approval/input drift to bypass the pending guard, or falsely accept an unusable result.
3. If approval is invalid, the supported rework interface may only administratively dispose that trusted closed run, including a historical task removed from current caches; it does not approve replacement work. If termination is unknown, records conflict or the supported operation refuses, preserve the original state and report the precise recovery blocker. A complete separately drafted alternative may still be presented within existing permissions, explicitly unsealed; it is not a successfully revised runtime task. Never rewrite state, delete locks, rebuild the task or infer missing identities to escape the blocker.
4. Once there is no active/ambiguous execution or pending acceptance, revise the complete package under the same task ID, increment the revision, resolve per-document references and run the complete prepare-review path scan and seal. Preserve old events and receipts. A new mechanical todo state does not mean old approval or verified status carries over; reusable evidence must satisfy current acceptance under the new version.

For session-only work preserve the complete old and new texts and real approval provenance in chat; do not invent disk state, a digest or CLI lifecycle.

## Review and resume

Present the complete replacement and its decisions/unknowns to the final user. A material change to methods, scope, inputs, permissions, resources or acceptance requires direct approval of that complete version before formal execution. Permission to diagnose or prepare a rewrite is not approval of the undisclosed replacement. Within an unchanged approved method, routine repair or reprioritization adds no new approval checkpoint.

After approval, use context → accepted prerequisites → begin → actual work → original-run submit → actual verification. Reuse unchanged evidence only with an explicit applicability basis; re-verify affected dependencies before downstream work. Apply the drift check at the next round's start and end. This protocol guides the agent's decisions; it is not a machine-enforced self-audit detector, a new scheduler or an additional permission grant.
