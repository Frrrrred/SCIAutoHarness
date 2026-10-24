# Attribution and licensing

## learn-claude-code: engineering design reference

This project was developed from the Harness engineering principles taught in [shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code), applied to a shared task workflow for Codex, Claude Code and official DeepSeek Harness.

The documentation reference is the root s01–s17 lessons at [ce8f9f186058939da54c9d6fead78dfb5d0fd6c3](https://github.com/shareAI-lab/learn-claude-code/tree/ce8f9f186058939da54c9d6fead78dfb5d0fd6c3), checked on 2026-10-23. This tutorial is not the external frozen runtime required by the separate upgrade suite.

Main influences include tool/permission boundaries, progressive skill loading, context discipline, dependency management, recoverable execution and completion against the whole objective. The [lesson mapping](docs/LEARN_CLAUDE_CODE.md) distinguishes these design references from implemented capabilities. This repository does not reproduce the tutorial's complete Python agent or every described service.

The tutorial uses MIT, Copyright (c) 2024 shareAI Lab. Its [upstream license](https://github.com/shareAI-lab/learn-claude-code/blob/ce8f9f186058939da54c9d6fead78dfb5d0fd6c3/LICENSE) is retained in [third_party/learn-claude-code.LICENSE](third_party/learn-claude-code.LICENSE).

## Cross-host design references

- [planning-with-files](https://github.com/OthmanAdi/planning-with-files/tree/de837a95cc845b6341a6cbfd902a89a8190c568e): shared Skill with explicit Codex, Claude and official DSH integrations.
- [superpowers](https://github.com/obra/superpowers/tree/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b): shared skills with platform references. Inspected source established Codex/Claude support, not DSH support.
- [ECC](https://github.com/affaan-m/ECC/tree/90606c8315ee09cafc303515c5f33024db6b9882): explicit installation targets/ownership and avoiding overlapping methods. Provider independence is not host compatibility.

Sources were checked on 2026-10-23. Popularity is not acceptance evidence. The adapters are independently implemented, without adding these frameworks as dependencies or importing hooks, MCP, orchestration or provider configuration.

## Code and compatibility evidence

The code retains Copyright (c) 2024-2026 ruvnet and its complete MIT text in the root [LICENSE](LICENSE) and installable [LICENSE](skills/codex-task-harness/LICENSE). A retained notice does not imply a runtime dependency.

Frozen reviewed templates, golden source digests and existing diagnostic fields retain original values where compatibility requires them. They represent historical contracts or provenance, not current integration requirements. Current maintained instructions/new templates are English. Historical text, original user/process data, Unicode fixtures, compatibility anchors and required notices keep their actual content. Digests identify bytes; they neither prove authorship nor reconstruct an authentic old runtime.

Repository documentation, CI, contribution and security material is maintained by contributors under MIT and remains outside the installable Skill. SYNTHETIC approvals/processes are test data, not human authorization or live-model evidence.

## Project relationships

This is an independent project, not an official OpenAI, Anthropic, DeepSeek, shareAI Lab or referenced-framework product, and no endorsement is implied. Official DSH is [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness); a DeepSeek model API in another agent is a different capability. Claims are limited by [validation](docs/VALIDATION.md) and [host evidence](docs/HOSTS.md).
