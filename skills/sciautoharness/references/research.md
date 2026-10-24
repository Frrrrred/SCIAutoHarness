# Research: study types, phase methods and evidence boundaries

This reference guides planning and review. It is not a source of scientific facts or an automatic validity certificate. Use applicable research-design, computing, statistics, literature, figure or writing skills that are actually available in the current host. Listing a skill does not establish that it was invoked or that its checks passed.

## Identify the research type and question first

| Type | Main evidence and planning | Conditional requirements |
|---|---|---|
| Empirical, interventional or observational research | Population, units, design, measurements, sources, estimand and uncertainty | State controls, confounding, replication, nesting, randomization and blinding according to the actual design; do not invent them |
| Prediction or machine learning | Prediction target, intended evaluation use, sample dependence, splitting and tuning, baselines and generalization | Separate patients, batches, times or other relevant units. Fit preprocessing, imputation, selection and tuning only within the appropriate training folds; external and test sets do not participate in selection |
| Theory or proofs | Definitions, assumptions, propositions, proof dependencies, counterexamples and applicability | Without samples or training, do not invent n, power or training sets; acceptance concerns logic and assumptions |
| Qualitative, synthesis or literature research | Question, material scope, source and selection rules, coding or synthesis methods, counterevidence and interpretive limits | Statistical sampling, effect tests and model training are not universal prerequisites |
| Numerical or computational reproduction | Fixed versions and protocols, reference values, algorithm and arithmetic checks, clean reruns and deviations | Do not require a prediction split when there is no prediction target. Distinguish unnormalized one-step local error from fixed-interval global error: for smooth solutions under applicable stability conditions, a one-step method with global order p typically has one-step error O(h^(p+1)). State explicitly if local error is divided by h, and keep order conventions consistent. Reproducing a known benchmark is not a new scientific discovery |

Types may overlap. Select constraints from the actual question rather than its label. Important protocol unknowns block dependent phases. For an inapplicable item, state "Not applicable," the reason and alternative acceptance evidence. Nonempty text or N/A alone is not substantive justification. Do not disguise an important unknown as inapplicable.

## Material integrity and parameter provenance

Before dependent analysis, verify actual sources, sample or subject identifiers and relevant field mappings. Record data versions or checksums and preserve raw inputs. Never fabricate observations or provenance, or silently overwrite original values, labels or linkage relationships.

Corrections, exclusions and justified imputation require explicit methods and reasons. Produce distinguishable derived or corrected versions while retaining originals, source mappings and the affected scope, and respect existing approval rules. Freezing protects traceability; it does not prohibit justified, versioned correction.

Before using conclusion- or reproducibility-relevant parameters, random settings and thresholds, record their original source locations or selection rationale. Not every number needs a paper citation, and an openly chosen arbitrary setting must not receive an invented literature justification. Retain configuration versions and reasons for changes. Execute prespecified search or adaptive rules under their approved recording requirements. A theoretical task without data or randomness does not require fabricated samples, seeds or run records.

## Whole-task and phase planning

First define the objective, question or claim type, complete dependencies, raw-input identities, deliverables, permissions, budget, overall acceptance and stopping conditions. Choose major phases for the actual task and state substantive methods and constraints before formal work: question and literature work when needed, design or protocol, data and quality, methods or experiments, evidence review, figures or writing, and reproduction or delivery. Give important unknowns a resolution route; "decide later" cannot bypass review of a major method.

Bind each user-fixed question and estimand consistently across the contract, phases, shared protocols and acceptance. Population and independent unit, outcome, comparison, scale, time origin, information-availability time, prediction horizon, setting and evaluation target must agree. Compare these definitions with actual inputs before sealing the complete package. A correct overall goal does not compensate for a detailed protocol that describes another task.

Do not replace a fixed prediction horizon with a pooled mixture of horizons. Label extra horizons or analyses as extensions; they cannot replace the mandatory primary objective or enter its acceptance silently. Resolve cross-file definition conflicts before review. Machine checks and a normal handoff do not prove semantic consistency.

Evaluate estimates against the parameter's actual domain, existence of solutions and numerical diagnostics. A real-valued effect coefficient may be negative or zero; positivity, significance or proximity to truth is not a general success condition. Check separate finiteness and positivity requirements of standard errors, variances and related quantities. Implementation acceptance must include finite negative and near-zero estimates. Failure classification and summary denominators must retain legitimate negative results.

For a Monte Carlo mean or bias, define the replicate-level quantity Z and the number m of independent valid replicates. Use MCSE=sqrt(s_Z²/m), where s_Z² is the sample variance. s_Z²/m is the variance of the mean, not its standard error. For MSE, Z is squared error. For RMSE, propagate uncertainty through the transformation used and state its limitations. Before sealing, use deterministic numerical examples and dimensional reasoning to check uncertainty formulas across phases, shared protocols and acceptance criteria.

When formal proofs are required, assign every mandatory proposition a production task, declared proof file and substantive review criterion. Tasks using those results for counterexample review, claim consistency or manuscripts depend on the proof task's verified result. Proof production may share a phase with dependency design or have its own phase; no fixed task or file count is required.

The deliverable must contain the complete formal proof. Acceptance reads definitions, quantifiers, every assumption, derivations and boundary cases, recording evidence locations, reasoning and unresolved items. A dependency graph, proposed lemma, plan chain, file existence or successful execution does not replace the proof. An incomplete core proof cannot pass or become an established downstream claim. During complete-plan review, trace each required result to its production task and declared output, substantive acceptance, and downstream prerequisite. Repair missing links instead of inferring scientific completion from machine review success.

When research acquires or prepares data or runs computations, trace every required artifact through its producer, explicit planned path, substantive acceptance and downstream verified prerequisite. Assign actual data and metadata, prepared samples, executable analysis or simulation code and configuration, replicate-level and main results, execution provenance, figures and text, and executable reproduction deliverables.

A project may combine these into coherent artifact bundles without a fixed file count. It cannot declare only a report or README while promising unowned data and scripts elsewhere in prose. The runtime owns execution receipts; cite their actual sources rather than making duplicate receipts.

Files still to be obtained or generated are later task outputs, not supposedly existing initial inputs. Missing materials or permission require an acquisition or verification owner, necessary inputs and blocked phase; they do not justify omitting the rest of the major plan. A pilot gate needs a producer that runs and passes acceptance before downstream work starts. An early stage cannot require pilot or validation evidence assigned to a later dependent task.

When several steps share one phase document, output ownership, permitted execution order and acceptance prerequisites must remain consistent and acyclic. Declare the actual images, prepared data and runnable code, or a real bundle containing them. A figure index, data audit or README is not the underlying artifact.

For each task's first actual program and configuration use, trace the contract output ID, real path or explicit bundle member, producing task and verified prerequisite. A combined script must list its covered steps. Directories organize files; loose delivery requires individual declarations of necessary members, while combined delivery requires a real archive and explicit member responsibilities.

A code bundle owned only by a late analysis task cannot supply an earlier preparation task's program. Assign the bundle to the first task that needs it with all necessary members, or declare early code and configuration separately. State create-before-use when a task produces and consumes its own artifact. Promises of future scripts, a generic code directory or a rerun-evidence Markdown file do not satisfy the executable delivery chain.

For unavailable prepared data and metadata, the complete current contract must still state specific planned paths or a real bundle, production ownership and acceptance. Do not postpone those declarations until materials arrive. A material gap blocks execution without removing planning responsibility. Check and repair the artifact chain before presenting the package.

See [Artifact files and archives](artifact-examples.md) for complete ordinary-file and real-archive production and consumption examples and their isolated regression entry. An accepted producer must create the archive before its members are consumed. Final packaging cannot replace early code or data production.

### Put the computational artifact chain in the contract before writing phase prose

The following table illustrates adjustable unique output IDs and paths. It is not a fixed file count, universal study design or list of additional current inputs. Rename, combine or remove inapplicable items for the actual task. Each applicable row must become deliverables paths, tasks.outputs IDs and substantive acceptance.

Under schemaVersion 1, deliverables[].path binds an ordinary file. Declare necessary loose member files individually. For combined delivery, declare a real archive and explain its required members, ownership and content acceptance in the phase. An output pointing to a bundle inventory, figure index or README binds only that description; it does not bind the described data, code, configuration, results or images. Declare those artifacts separately.

If a machine check reports overlap between a declared directory and its member files, retain actual delivery and revise ownership. Declare necessary member files without the parent directory, or declare a real archive with inventories and receipts as members covered by content acceptance. An independent receipt can also live at a nonoverlapping path outside the archive.

Directories are not currently supported output types. Do not resolve path conflicts by replacing a bundle with an inventory, a numerical table with narrative prose, removing a downstream requirement, or retaining only run instructions without executable rerun code. After revision, refresh refs, synchronize phase deliverables and substantive acceptance, recheck the complete package and deliver the pending review normally. Mentioning members in a methods paragraph while the contract declares only protocol, report or README files is insufficient.

| Producer and verified prerequisites | Illustrative planned artifacts | Acceptance and consumers |
|---|---|---|
| Source acquisition and preparation, after source and design checks | raw-data: data/raw.csv; metadata: data/metadata.json; clean-data: data/analysis.csv; prep-code: code/prepare.R | Lawful source, fields, physical and independent units, exclusion trail and executable preparation agree; analysis depends on this task |
| Analysis or prediction, after accepted prepared data | analysis-code: code/analyze.R; config: config/analysis.json; estimates: results/estimates.csv; predictions: results/predictions.csv | Runnable code and configuration, estimates, intervals and diagnostics, fold-specific prediction processing and traceable saved predictions; figures and text depend on this task |
| Simulation implementation checks, after frozen design | sim-code: code/simulate.R; scenarios: config/scenarios.json; checks: results/implementation-checks.json | Check truth, data-generating process, missingness rate, pooling formulas and random streams; pilot depends on this task |
| Pilot, after implementation checks; the pilot need not already have passed itself | pilot-results: results/pilot.csv; pilot-gate: results/pilot-gate.json | Correctness, failures, runtime and total budget determine whether main simulation may proceed; main simulation dependsOn pilot |
| Main simulation, after a verified pilot | replicates: results/replicates.csv; summary: results/summary.csv | Fixed scenarios and replicates, failure records, metrics and MCSE; figures and text depend on this task |
| Figures, writing and reproduction, after verified results used by them | figures: figures/main.png; manuscript: paper/manuscript.md; rerun: code/reproduce.R; environment: repro/environment.json | Actual images agree with tables and code, claims are supported and clean reruns work; a README supplies usage instructions only |

An observational study may use the first two rows plus figures and manuscript delivery. A simulation may use implementation checks, pilot, main simulation and figures or manuscript delivery. Combine mixed tasks by actual dependencies, adding question, literature, design and domain constraints as needed. Use actual runtime receipts; a separate environment inventory does not replace them.

The total computational budget includes implementation checks, pilot and formal execution; do not silently count only the main run. Missing materials or permission may block future execution, but all future data, code, result and figure production responsibilities still belong in the complete plan. Do not reduce the objective to protocol-only delivery.

For missingness simulations, define and accept calibration equations separately for each mechanism. A covariate-dependent equation cannot be applied to a constant-probability mechanism. For target marginal missingness probability p with M=1 indicating missingness, MCAR has constant probability p. If expressed using a logit intercept, a=log(p/(1-p)), without a random-covariate term.

Only when MAR or MNAR uses logit Pr(M=1|V)=a+bV should calibration solve E[expit(a+bV)]=p over its specified generating distribution of V. MAR uses the designated observed V; MNAR uses the designated unobserved V. Fix b according to the actual design. Check that configuration, implementation and acceptance use the same mechanism-specific equation and verify substitution error. Distinguish target marginal probability from realized finite-sample missingness. This conditional example does not require other research to simulate missingness.

For actual empirical data, check independent units, biological versus technical replication, repeated measures, batch and nesting, inclusion and exclusion, missing or anomalous values, and confounding. Cells, fields of view, reads, technical replicates and repeated observations from one participant must not masquerade as independent n.

Record primary and exploratory endpoints, models and assumptions, effect sizes and intervals, diagnostics, multiplicity and sensitivity. Explain inapplicable items. Prediction follows the training-fold fitting and isolation rules above; descriptive and theoretical tasks do not inherit them mechanically.

Maintain traceable links from raw materials through derived processing or proof steps, code, parameters, environment and actual execution, numerical, logical or statistical evidence, and finally figures, manuscripts and citations. Important computational results and figures must identify actual inputs, code and configuration versions and execution evidence. Planned commands or prose assertions do not replace observed execution. Reuse existing authorized records instead of creating a generic ledger.

Hashes identify content versions and changes. They do not independently authenticate sources, establish that a particular script generated a result or prove scientific correctness. Report physical units, data licenses and access restrictions, and source gaps from actual materials. Legends and text must agree on units, groups, definitions of n, interval interpretation and actual methods.

## Changes and approved iteration

Changes to immutable inputs or reviewed protocols pause dependent work and require review; do not weaken digest protection. If only source locations, parameter rationale or execution evidence are supplemented, and reviewed files, bound inputs, methods, permissions, resources and acceptance remain unchanged, reassess the restored evidence and continue under the original approval. Supplementing evidence alone is not a new plan. Actual changes to reviewed files or bound inputs still follow digest invalidation and re-review rules.

Data batches and intermediate results collected or produced under approved rules are phase outputs and are frozen for handoff after acceptance. Do not write ordinary run records or state changes back into the reviewed specification.

Material changes to sources, unit definitions, primary endpoints or models, exclusions, splits, claims, rights, cost or acceptance require revision. Approved adaptive rules may be executed, but they do not permit post hoc endpoint changes or unbounded sampling. Present a concrete revision before making a change that the current approved task cannot express.

## Acceptance and feedback

For source identities, data quality, key configuration and parameters, and conclusions that can affect downstream validity, make producer-consumer dependencies and release criteria explicit. Complete substantive acceptance before first downstream use.

Even when numerical gates pass, check scientific and data failure modes relevant to the study type and claim. Record actual objects and methods checked, evidence locations, failures and exceptions, unresolved uncertainty, release or block reasons, and affected downstream work. Unverified or stale results cannot satisfy prerequisites. After an upstream correction, invalidate and reaccept affected results.

Proceed under existing approval and acceptance rules. Do not request the same human approval at every checkpoint unless the approved protocol requires it.

Process exit, file existence, complete fields, model improvements, statistical significance, matching hashes, review=pass or AI agreement does not establish scientific validity. Structured review records identify the reviewer, evidence and reasoning; important claims still require reading primary sources, independent calculation or proof checks, or actual reruns. Distinguish evidence from the same model and context, two algorithms organized by one person, and reproduction by an independent laboratory.

Preserve null effects, opposite effects, failed reproductions, instability and quality failures. Nonsignificance does not establish absence of an effect, and significance does not establish importance, causation or mechanism. Insufficient causal or mechanistic evidence cannot support stronger claims. Do not silently change the objective and then declare completion.

After failure, distinguish implementation or numerical errors, data or measurement defects, inapplicable design or assumptions, insufficient information and credible counterevidence. Report specific evidence, the next discriminating check, permitted repair, affected retest dependencies and stopping conditions.

Do not change data, thresholds or models without justification to pursue a positive result. Apply material-integrity, versioning and approval rules to legitimate corrections, exclusions and imputation, then reaccept affected results. A valid negative result or explicitly supported uncertainty can satisfy the agreed delivery.
