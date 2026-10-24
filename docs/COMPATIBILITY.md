<a id="兼容性与使用限制"></a>
# Compatibility and limits

[README](../README.md) · [Host profiles](HOSTS.md) · [Validation](VALIDATION.md)

<a id="环境"></a>
## Environment

| Scope | Established conditions |
| --- | --- |
| Core | Node built-ins and bundled modules; no npm dependencies |
| Local baseline | Windows / Node v26.12.1; exact current evidence in VALIDATION |
| Complete regressions | Python standard library, pwsh, links, ACLs and NTFS streams |
| Other OS / minimum Node | Full behavior and a minimum version are not established |
| Native workflows | Actual supported discovery and native tools |
| Independent run | Supported local client entry and applicable execution/model authorization |

CI evidence applies to its real environment/assertions. Parsing modules does not establish cross-platform behavior. Help/version probes are distinct from live discovery and model/tool execution.

<a id="模板与旧任务"></a>
## Templates and existing tasks

State schema remains 1; template selection is separate:

| Value | Rendering and effective host |
| --- | --- |
| Omitted or numeric 1 | Frozen v1, Codex |
| Numeric2 | Frozen v2, Codex |
| Numeric3 | Frozen v3, Codex |
| Numeric4 | Current template with reviewed allowedHosts/defaultHost |
| Other values/types | Rejected for new formal work |

Unchanged old approved, pending, verified and active packages continue without added fields, contract reordering, rerendering or reinterpretation of arbitrary old execution JSON. Deliberate template/policy changes require resolving pending acceptance and factually closing activity first, then incrementing revision, completing review and obtaining direct human approval.

Unknown versions and reviewed-file changes block new formal work while preserving original stale factual closure. Closure does not restore eligibility. Older runtimes need not understand template 4; deleting fields or downgrading cannot restore approval. See [runtime](../skills/agent-task-harness/references/runtime.md) and [recovery](../skills/agent-task-harness/references/recovery-maintenance.md).

<a id="安装与文件系统"></a>
## Installation and filesystems

Install only the nested skill, with explicit host/home/skill roots and fixed instruction names. No credentials, providers, persistent models or unrelated settings are configured. New previews/manifests use safety3. Old previews need regeneration and exact review. Complete original safety1 and safety2 manifests retain their original safe rollback; incomplete or unsupported ones require manual review rather than fabricated fields.

Valid UTF-8, optional BOM, CRLF, Unicode and missing final newline survive. Unsafe links, multiple hard links, unreliable identities and unsupported encodings are refused. Existing-file writes preserve their validated handle and metadata under the documented normal path; timestamps may change. This is not protection against every malicious filesystem race.

Different managed blocks or extra installed files remain safe refusals. Replacement does not bypass them. Review manual handling before a fresh preview. This restriction does not change unchanged old-task continuation.

All current install/rollback entrypoints acquire canonical mutation roots in stable order, releasing only acquired locks. Different homes sharing a skill root therefore coordinate. Older/unrelated writers without that protocol must be quiesced; the runtime is not a global OS lock or authentication system.

Install/rollback may partially complete. A nonzero exit does not prove no changes. Use stage, logical failedTarget, original cause, manifest, backup directory and successful operation counts to inspect real state. Preserve evidence; do not automatically retry or clear a lock.

<a id="宿主与教程边界"></a>
## Hosts and tutorial boundaries

[HOSTS](HOSTS.md) distinguishes Codex sandbox options, Claude normal print-mode permissions and DSH's configured headless profile. No bypass or equivalent-enforcement promise is added. DSH headless does not automatically use GUI sign-in; see its pinned credentials contract.

The repository supplies no model service, daemon, scheduler, MCP server, general long-term memory or complete team service. Check actual host capabilities and authorization. Approval records do not authenticate operators; hashes do not establish origin or scientific truth. External writes, installation, resource use and model execution retain actual user permission requirements.

## DeepSeek Harness evidence

Support targets [official commit 687f282e8625c6b8d11ff58211a90524be2e4317](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317), with `@deepseek-ai/dsh` `0.2.1-rc.2`. Source and strict local fixtures test that fixed contract. Developer-preview changes may require renewed adapter checks.

DSH was not installed for this work. Live discovery, provider integration and model execution remain unverified. No real model run for any host is part of validation.

<a id="升级实测边界"></a>
## Upgrade-test boundary

**The original 84 cross-runtime upgrade cases were not run.** Their matching external frozen baseline is unavailable. Its full identity and fixed-oracle provenance must be verified before that suite can run. Main regressions, goldens, current-baseline continuations and host/install tests are separate evidence. The current package and tutorial are not substitutes.

Non-English anchor IDs preserve old links.

## Canonical naming and migration

New previews use **safety3** and bind both skill roles and the fixed instruction target. A recognized full old installation requires a fresh reviewed preview with **both** `--replace-skill --migrate-legacy`. Unknown files, modified old code, mixed/duplicate markers and customized blocks are refused. Separately reviewed exact custom-block changes use the explicit before/after API; the CLI never silently overwrites them.

Migration moves original old files on the same volume into bound recovery storage outside skill discovery, using numbered `.bin` slots. It retains old empty directories and their metadata. Successful rollback restores original identities, ACLs and NTFS streams, then the original safety1/2 manifest can be used again. Existing safety1/2 manifests and old previews are not rewritten. Old previews require regeneration. Reverting the old manifest before reverting the migration is rejected as drift.

A failed install/rollback can be partial. Preserve the manifest, backups, retirement storage, original cause and confirmed progress. Prepared migration manifests record completed moves and writes; an interruption before a journal confirms a new file's identity requires manual review. Only completed installations support automatic rollback. Never delete a same-hash file by guessing its identity, blindly retry, or clear a lock.


Canonical and legacy entries share one engine and existing writer roots. The compatibility entry owns no task state. Template1–4, host IDs, schema1, current `harness/<id>/` and legacy `.codex/harness/<id>/` locations, approvals and run identities are unchanged. The old repository route redirects; update clone remotes and external GitHub Action references explicitly. Do not reuse the old repository name.

Frozen template1/2 renderers and goldens retain their original wording solely for byte-compatible old-package verification. This is not a Ruflo installation or service requirement. The legacyRufloDirectivesDetected diagnostic field is retained as a machine-interface compatibility exception. No personal local configuration is distributed.
