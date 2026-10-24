# Compatibility

[README](../README.md) · [Hosts](HOSTS.md) · [Installation](GETTING_STARTED.md)

The core requires an existing Node.js runtime capable of executing the bundled ES modules and built-in APIs. No package download is part of normal operation. Scientific scripts retain their own declared environments and dependencies.

## Tasks and executions

Task schema remains `1`. Missing template version and explicit versions `1`–`3` retain their frozen behavior; new plans use template `4` with an explicit host policy. The runtime does not rewrite old tasks on read. Existing task directories, approvals, runs and receipts remain in place. Conflicting task locations or execution identities require resolution rather than choosing one silently.

An active run retains its original binding even if evidence becomes stale. Identical factual replay can recover a published receipt; conflicting facts are refused. Stale closure does not renew approval or accept results. Immutable inputs tied to an earlier skill path or content may correctly require review after an installation change.

## Installation

New installation records use safety format `4`. Complete original formats `1`, `2` and `3` retain their own validation and recovery paths. Changing a format number does not convert a record. Old previews need a fresh current preview and exact approval.

The installer requires ordinary single-link files with reliable identity and checks roots, contents and managed rules. It retains original files outside discovery through same-volume retirement where migration requires it. Restore the latest migration before applying an earlier installation rollback. Prepared or partial records require diagnosis, not automated rollback.

Existing explicit entries share the formal runtime and task state. Current instructions use `$sciautoharness`; no second engine or approval store is introduced. For exact formats and refusal conditions, see the [runtime reference](../skills/sciautoharness/references/runtime.md).
