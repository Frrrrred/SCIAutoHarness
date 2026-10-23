# 与 learn-claude-code 的关系

[返回 README](../README.md) · [来源与许可](../ATTRIBUTION.md)

本项目基于 [learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) 的 Harness 工程原则，面向 Codex 开发与复核。以下对应帮助理解设计取舍，不代表复制了整个教程 Agent 或实现了全部课程机制。

文档参考固定到 [ce8f9f186058939da54c9d6fead78dfb5d0fd6c3](https://github.com/shareAI-lab/learn-claude-code/tree/ce8f9f186058939da54c9d6fead78dfb5d0fd6c3) 的根目录 s01–s17；旧 docs/agents 的 12 课编号不同，不混用。

| 当前章节 | 本项目的对应或边界 |
| --- | --- |
| s01 Agent Loop | Codex 宿主负责模型与工具循环；本地运行时管理任务事实 |
| s02 Tool Use | 显式 CLI 参数、产物和验收接口 |
| s03 Permission | 完整方案批准、受审摘要及实际宿主权限 |
| s04 Hooks | 启动/提交/验收边界检查；没有提供通用 Hook 插件系统 |
| s05 TodoWrite | 全目标、阶段、产物、验收和依赖地图 |
| s06 Subagent | 使用宿主可用的独立只读委派，不另造模型服务 |
| s07 Skill Loading | SKILL 路由与按需参考文件 |
| s08 Context Compact | 当前阶段 context 与摘要纪律；压缩能力归宿主 |
| s09 Memory | 任务持久状态与恢复文件；没有通用长期记忆引擎 |
| s10 Task System | DAG、唯一产物归属、verified 依赖 |
| s11 Background Tasks | 保留真实运行身份与句柄；不创建常驻守护 |
| s12 Cron Scheduler | 不内置 cron；宿主调度仍需明确授权 |
| s13 Agent Teams | 宿主委派与写入门禁；没有完整团队服务或 worktree 管理器 |
| s14 MCP Plugin | 宿主工具按实际可用性路由；不自动注册 MCP |
| s15 Integrated Harness | 统一契约、批准、执行和验收边界 |
| s16 Workflow Runtime | 固定依赖、证据与可恢复状态 |
| s17 Goal Loop | 完整目标与必做交付闭合；没有另启模型评估器 |

## 面向 Codex 的工程化重点

- 把受审计划、运行事实、证据新鲜度和当前验收状态分别维护。
- 将产物依赖和失效传播落实到文件、回执与验收，而不是仅维护完成勾选。
- 用原 runId 处理异常收尾，区分进程结束、事实闭合和合资格验收。
- 对启动、验收、安装和回退保留具体失败与恢复位置。
- 用冻结模板和完整回归约束文档/实现语义，保留真实未执行项。
- 让简单工作直接完成，只对复杂任务采用完整审查与渐进加载路线。

以上机制的实际状态见[架构](ARCHITECTURE.md)与[验证说明](VALIDATION.md)。独立模型智能、OS 隔离、身份认证、科学效度及宿主未提供的能力不能由本仓库替代。

## 来源声明

教程采用 MIT；[参考许可](../third_party/learn-claude-code.LICENSE)随仓库保留。代码的既有 MIT 版权通知见[来源与许可](../ATTRIBUTION.md)。这些说明用于准确记录设计参考和许可，不表示官方背书或直接 fork 关系。
