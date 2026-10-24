# Relationship to learn-claude-code

[README](../README.md) · [Attribution](../ATTRIBUTION.md)

This project applies the Harness engineering principles taught in [learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) to Codex, Claude Code and official DSH. The mapping explains design choices, not a reproduction of every course mechanism or its complete agent.

The reference is root-level s01–s17 at [ce8f9f186058939da54c9d6fead78dfb5d0fd6c3](https://github.com/shareAI-lab/learn-claude-code/tree/ce8f9f186058939da54c9d6fead78dfb5d0fd6c3). Older twelve-lesson numbering under docs/agents is a different structure.

| Lesson | Behavior or boundary |
| --- | --- |
| s01 Agent Loop | Host owns model/tool loop; runtime manages task facts |
| s02 Tool Use | Explicit argv, artifacts and acceptance interfaces |
| s03 Permission | Whole-plan approval, digest and real host controls |
| s04 Hooks | Begin/submit/verify checks; no general hook plugin system |
| s05 TodoWrite | Whole objective, stages, outputs and dependencies |
| s06 Subagent | Available authorized host-native read-only delegation |
| s07 Skill Loading | Shared router with conditional/host references |
| s08 Context Compact | Selected context; compaction itself is host-owned |
| s09 Memory | Durable task state/recovery, not general long-term memory |
| s10 Task System | DAG, unique output owners and verified prerequisites |
| s11 Background Tasks | Original identity/real handles, no permanent daemon |
| s12 Cron Scheduler | No built-in cron; separate authorization still applies |
| s13 Agent Teams | Host delegation/writer gates, not a complete team service |
| s14 MCP Plugin | Actually available tools, no automatic MCP registration |
| s15 Integrated Harness | Shared approval/execution/acceptance boundaries |
| s16 Workflow Runtime | Dependencies, evidence and recoverable states |
| s17 Goal Loop | Whole-objective completion, not another model evaluator |

Keep reviewed plans, execution facts, freshness and current acceptance distinct. Invalidated artifacts propagate through dependencies. Close interrupted work with its original runId, distinguish termination/factual closure/eligibility, and retain concrete begin/verification/install/rollback failure locations. Frozen templates and complete regressions check agreement. Simple work proceeds directly; complex work retains review and progressive disclosure.

Host adapters share these rules without reimplementing a model loop or provider layer. A DeepSeek API in another agent is distinct from official DSH. See [architecture](ARCHITECTURE.md), [hosts](HOSTS.md) and [validation](VALIDATION.md). The repository cannot supply missing host tools, authenticate humans, certify science or replace OS isolation.

The tutorial MIT [license](../third_party/learn-claude-code.LICENSE) is retained; existing notices and design references are in attribution. Influence/licensing imply neither endorsement nor a direct complete-agent fork. The tutorial commit is not the external baseline for the unexecuted84 upgrade suite.
