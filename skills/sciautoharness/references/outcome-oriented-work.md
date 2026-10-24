# Outcomes, professional checks and complementary methods

Read the branch that helps choose a goal or resolve a consequential uncertainty. New complex tasks enter through [authoring](authoring.md); existing tasks first use master/recovery → context. These methods fit the existing objective, phase and acceptance descriptions. They add no runtime fields, standing roles or approval stages.

## Altitude: connect the artifact to its use

Use when the intended use is unclear or a requested artifact would not answer the underlying decision.

1. Identify the requested artifact and who will use it.
2. State the decision it should support. If already explicit, use it directly. If ambiguous, offer the few interpretations that change the work and clarify only that difference.
3. Work backward to the evidence needed to make that decision, then express it in existing deliverables and acceptance.
4. Check scope before adding work. Present a broader objective with its extra inputs, costs and permissions for review; proceed with the original authorized objective while independent work remains useful.

Example: a reproduction report can support choosing a comparison baseline. Its completion evidence includes the smallest documented execution, protocol/reference agreement and remaining deviations, rather than only a successful command. If the user requested only installation diagnosis, finish that diagnosis; a full research comparison is a separate proposal.

Exit when the requested result, supported decision and sufficient completion evidence agree. Outcome reasoning should resolve the plan, not create a second planning system.

## Depth: choose a check that can change the conclusion

Use when an assumption, unexpected result or evidence gap controls the next decision.

- Name the material and instrument a competent practitioner would actually use: raw measurements, original definitions, source code, numerical diagnostics, a documented evaluation or a primary reference.
- Write the leading explanation and a credible alternative. Before testing, state what observation would distinguish them. Pick the smallest authorized check with that ability.
- Choose a judgment outside the generated explanation: a certified value, independent calculation, actual replay, counterexample or source location. Another model's agreement can help review reasoning; describe its relationship to the executor accurately.
- Match the conclusion to what the check establishes. A command receipt, content hash or completed review form answers a narrower question than scientific correctness.

Example: an unexpected metric can arise from a changed denominator, sample linkage, implementation or model assumption. Inspect the relevant identifiers and definitions before rerunning a larger experiment. Hold verified inputs fixed while comparing candidate causes; record any legitimate input correction as a new version under the current protocol.

Exit when the evidence supports the required decision or identifies a precise unresolved gap and its consequence. Preserve a failed reproduction, negative finding or supported uncertainty. Use the existing [research rules](research.md) for provenance and release boundaries and [judgment](execution-judgment.md) for repair and retesting.

## Range: select methods for distinct questions

Use when one perspective leaves a consequential failure mode unchecked. Select a useful method; a role label alone adds no evidence.

| Method | Trigger | Distinct check | Handoff evidence |
|---|---|---|---|
| Data engineering | Sample, field or metric identity is uncertain | Trace keys, units, joins, versions and denominators | Source-to-derived mapping and explicit differences |
| Statistics | Inference exceeds the experiment | Inspect independent units, controls, uncertainty and sensitivity | Assumptions checked against actual design and observations |
| Numerical analysis | Results depend unexpectedly on arithmetic or parameterization | Hold the model fixed and inspect scaling, conditioning, rank and a suitable solver | Comparable inputs, diagnostics and output differences |
| Software engineering | Execution or an interface is unstable | Reproduce the fixed input across actual code and failure paths | Exact commands, versions and behavior |
| Domain knowledge | A plausible number has unclear meaning | Check definitions, dimensions, mechanisms and boundary cases | Primary-source support or a specific counterexample |

Before delegating, state the independent question, exact read scope, current approval, required evidence and finish condition. Use available native read-only delegation only where investigations are independent; the primary writer integrates results serially under [context discipline](context-hygiene.md). Conflicting accounts become a discriminating check, not a vote. Choose no extra agent when one direct check suffices.

Exit when the distinct questions that affect acceptance are answered or explicitly unresolved. Extra disciplines, tools, models, downloads or services still need their actual authorization.

## Assess actual benefit

Compare observed task outcomes before making an efficacy claim. Separate interface checks, deterministic reference checks and live task behavior; retain failures, costs and unavailable measurements. A clearer plan or more agents does not by itself establish better research. Small paired examples support only the cases and setting actually observed.

The altitude/depth/range framing is inspired by [Felix Rieseberg's essay](https://felixrieseberg.com/how-to-be-more-ambitious-a-tutorial-for-humans-with-models/). The workflow above applies those ideas within this Harness's existing approval, execution and evidence contracts.
