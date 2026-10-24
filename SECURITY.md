# Security and reporting

This project manages local contracts, facts, evidence and installation. Records do not authenticate humans or provide an OS sandbox. Hosts retain their own filesystem/network/model/system permissions; the three profiles do not make enforcement equivalent. See [HOSTS](docs/HOSTS.md), [compatibility](docs/COMPATIBILITY.md) and [runtime](skills/agent-task-harness/references/runtime.md).

## Execution and installation

Runs use local executables, explicit argv, stdin and shell:false, retaining documented permissions. No bypass, downloader, provider/model selection or host fallback is added. A reviewed allowedHosts policy limits new adapter selection, not identity, credentials or access rights.

Previews/manifests bind profile, fixed instruction name, roots and identities. Locks/containment support the documented local workflow, not every adversarial concurrent link substitution. A binding checksum is an integrity check, not a signature or operator authentication. Review task content/logs before sharing.

## Reporting

Ordinary defects use [Issues](https://github.com/Frrrrred/agent-task-harness/issues). Keep vulnerability details, exploit instructions, secrets and real paths out of public issues. No dedicated private contact is declared and private vulnerability reporting is not assumed enabled. Ask publicly only for a secure contact route, then use the private channel actually supplied; an available Security-page private reporting entry can also be used.

The maintainer profile is [Frrrrred](https://github.com/Frrrrred). Never post tokens, complete personal instructions/configurations or real logs. After a secure channel exists, supply affected entry, host/mode, reproduction conditions, impact, runtime/platform and minimal sanitized evidence.

Preserve failures. Reproduce in synthetic fixtures instead of deleting real state, clearing activity, changing approvals or damaging a personal installation. Source/controlled processes do not establish live-host security or model behavior. [Validation](docs/VALIDATION.md) states actual evidence and limits.
