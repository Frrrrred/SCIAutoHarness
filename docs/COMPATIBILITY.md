# Compatibility and upgrades

[README](../README.md) · [Hosts](HOSTS.md) · [Installation](GETTING_STARTED.md)

The core uses an existing Node.js runtime and built-in APIs. Repository validation targets Windows with Node 26. Scientific scripts retain their own environments; installing the skill does not install their dependencies or call models.

## Current record contract

Current records use format=sciautoharness, schemaVersion=1 and the fixed kind for their entry. Contracts, execution, review, installation and metadata have strict fields. Sharing a schema version number does not make an older template or safety format the same contract.

Unsupported namespaces, kinds, schemas and damaged records remain unchanged and refuse control writes. There is no automatic conversion or inherited approval or verified state. Do not change a format number, remove fields or clear state to bypass refusal. The previous template-version and safety-format compatibility promises do not apply to this current runtime.

Complete recognized records retain their defined recovery behavior. New fields and paired readers/validators must be deployed together; an older strict reader is not guaranteed to accept a new record. Missing or conflicting source, receipt, output or acceptance evidence invalidates affected dependencies.

## Goal alignment and stage dialogue

The skill includes dependency-aware goal questions, early feasibility checks and limits on adding methods without an unmet acceptance requirement. At each substantive stage handoff, the agent reports results and limits, describes the next tasks, asks two or three relevant questions and waits for an actual user reply. The final stage asks for delivery feedback without creating a new task. The grill-me-inspired instructions are part of this package, not a dependency on another skill or a live web page.

Conversational waiting is a host instruction, not a new CLI or record-schema gate. A technical acceptance result or `canBegin` does not establish that the user replied. Conversely, ordinary direction feedback does not replace technical acceptance or approve a material change. Material changes still require the complete revised plan to receive direct user review. These instructions do not change schemaVersion, command interfaces or the obligation to preserve the original controller for active work.

## Preserve original tasks and controllers

Before updating an installation or checkout, identify active and pending work and preserve its complete matching controller and records. Continue with the controller that began it; do not pull over an active controller checkout or hot-switch a run.

The earlier public contract is available at [the previous main commit](https://github.com/Frrrrred/SCIAutoHarness/tree/4f6e8cc9b6e9772b6e9a0ddb2012d44b9a8483da). Retain the actual version associated with each original run rather than assuming that commit matches every historical task.

Spawned CLI close is a process observation, not final business closure. The original controller submits actual business-end evidence with the original run, host and executor. Stale factual closure does not restore approval. Trusted administrative rework can resolve an ended obligation without approving new execution.

## Installation and recovery

The current skill inventory has exactly 34 members. Previews bind those source bytes, target shape, original identities, managed instructions and observed metadata. Extra or unknown members and unreviewed rule changes refuse installation. An old 40-member installation is not made compatible by --replace-skill or by deleting files to match a count.

For an incompatible old installation, preserve its original controller, tasks and recovery material. Follow that version's supported recovery or obtain a separate reviewed retirement/migration plan. This runtime does not offer the former --migrate-legacy route.

On Windows, metadata collection requires an existing PowerShell capable of enumerating file and directory alternate streams. Coverage is owner, group, DACL, attributes and observed ADS; SACLs and extended attributes are outside that coverage. Other platform branches do not establish an actual POSIX installation verification.

New transaction directories are private before sensitive writes. Plans, backups and journals inside them receive the corresponding private-storage checks. External CLI preview files and stdout remain the caller's responsibility. Existing target and shared-parent identities, permissions and observed streams remain bound.

Normal rollback accepts only a complete current installed transaction with intact bound plan, backups, targets and metadata. Prepared, partial, unconfirmed, changed or unsupported records refuse ordinary rollback. Errors do not imply unchanged targets; preserve actual progress and originals instead of automatic retry or rollback.

## Windows atomic replacement risk

Intermittent EPERM was observed during atomic rename-based file replacement on Windows. Its original native cause remains undetermined. Explicitly closing the observed read/write handles did not establish a cure. A successful installation or CI run also does not establish that the risk has disappeared.

Preserve the original error and actual publication state after failure. Do not add blind retries, ignore errors or force a partial transaction through normal rollback. Validation distinguishes passed, failed and skipped cases and retains fixture-preparation retry records.

See the [runtime reference](../skills/sciautoharness/references/runtime.md) for exact fields, refusal conditions and recovery interfaces.
