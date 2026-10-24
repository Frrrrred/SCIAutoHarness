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

Follow [installation and daily use](docs/GETTING_STARTED.md) to preview the exact installation targets, review the plan and apply it. In a new Codex session, invoke `$sciautoharness`.

## Work with a complete task

1. Define the result, sources, permissions and acceptance criteria.
2. Review the complete plan before execution.
3. Execute approved stages and accept their evidence before dependent work.
4. Resume through the original entry, preserving the approval and run identity.

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
