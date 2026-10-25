# Compatibility

[README](../README.md) · [Hosts](HOSTS.md) · [Installation](GETTING_STARTED.md)

The core requires an existing Node.js runtime capable of executing the bundled ES modules and built-in APIs. No package download is part of normal operation. Scientific scripts retain their own declared environments and dependencies.

## Tasks and executions

Task schema remains `1`. Missing template version and explicit versions `1`–`3` retain their frozen behavior; new plans use template `4` with an explicit host policy. The runtime does not rewrite old tasks on read. Existing task directories, approvals, runs and receipts remain in place. Conflicting task locations or execution identities require resolution rather than choosing one silently.

An active run retains its original binding even if evidence becomes stale. Identical factual replay can recover a published receipt; conflicting facts are refused. Stale closure does not renew approval or accept results. Immutable inputs tied to an earlier skill path or content may correctly require review after an installation change.

## Installation

On Windows, safety format `5` preview, installation and recovery also require an existing `pwsh` that can enumerate directory alternate streams. Missing or incomplete metadata support refuses the operation; PowerShell is not installed automatically. The preview states its metadata coverage. SACLs and extended attributes are outside that coverage.

New installation records use safety format `5`. Complete original formats `1`–`4` retain their own validation and recovery paths. Changing a format number does not convert a record. Old previews need a fresh current preview and exact approval.

The installer requires ordinary single-link files with reliable identity and checks roots, contents and managed rules. Recognized legacy directory trees leave skill discovery through same-volume rename, preserving their original roots, descendants and recorded identity and metadata bindings. Restore the latest migration before applying an earlier installation rollback. Prepared or partial records require diagnosis, not automated rollback.

`sciautoharness` is the sole current skill entry. Existing tasks, approvals, runs and receipts retain their original identities and recovery rules through the canonical CLI. Removing old entrypoints does not migrate or reapprove task state. For exact formats and refusal conditions, see the [runtime reference](../skills/sciautoharness/references/runtime.md).
