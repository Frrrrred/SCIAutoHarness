# SCIAutoHarness

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Español](README.es.md)

**Scientific Automation Harness** — a harness for planning, reviewing and carrying research tasks through traceable execution and recovery.

SCIAutoHarness works inside an agent host. It turns a complex request into a complete plan, keeps human approval tied to that plan, advances work through accepted dependencies and preserves the original run when work resumes. Scientific conclusions remain tied to their sources, parameters and execution evidence.

## Get started

Use an existing Node.js environment and agent host. The core uses Node.js built-ins and needs no dependency installation.

```powershell
git clone https://github.com/Frrrrred/SCIAutoHarness.git
cd SCIAutoHarness
npm run help
```

Before upgrading an existing installation or active task, read [compatibility and upgrades](docs/COMPATIBILITY.md). The current record contract is not an automatic migration of earlier templates or installation formats.

Follow [installation and daily use](docs/GETTING_STARTED.md) to preview the exact installation targets, review the plan and apply it. In a new Codex session, invoke `$sciautoharness`.

## Work with a complete task

1. Clarify the intended result, sources, permissions and acceptance criteria, using questions that resolve consequential unknowns in dependency order.
2. Review the complete plan before execution.
3. Execute approved stages and accept their evidence before dependent work.
4. Resume through the original entry, preserving the approval and run identity.

Check the earliest uncertain premise before expanding dependent work. Add a method only when it addresses an unmet acceptance requirement, and distinguish local evidence from completion of the whole stage.

At each substantive stage handoff, the agent gives a short result and evidence summary, states the next tasks, asks two or three relevant questions, and waits for your actual reply before advancing. The final stage also asks for delivery feedback. This questioning approach adapts grill-me and is included in the skill; no separate grill-me installation is needed. The agent host carries out the conversational wait. See [compatibility](docs/COMPATIBILITY.md) for the distinction between feedback, technical acceptance and approval of material changes.

Simple questions and isolated low-risk edits can proceed directly. For research, the plan also records source provenance, parameter choices, uncertainty and the checks needed before downstream use.

```text
Use $sciautoharness to prepare a complete plan for this research task: …
Use my existing research-sci environment. Identify inputs, outputs,
permissions and acceptance criteria. Wait for my review before execution.
```

## Hosts and permissions

Host profiles cover Codex, Claude Code and DeepSeek Harness. Discovery, credentials and model execution belong to the selected host. Installing this skill does not install a host, configure a provider or authorize external actions. See [host profiles](docs/HOSTS.md) and [compatibility](docs/COMPATIBILITY.md).

## Documentation

- [Installation and daily use](docs/GETTING_STARTED.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Host profiles](docs/HOSTS.md)
- [Compatibility](docs/COMPATIBILITY.md)
- [Contribution](CONTRIBUTING.md) and [security](SECURITY.md)

## License and sources

Released under the [MIT License](LICENSE). See [attribution](ATTRIBUTION.md) for source notices and design references.
