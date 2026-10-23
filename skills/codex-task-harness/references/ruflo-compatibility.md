# Ruflo 与 Codex 的兼容边界

本模式实际验证的契约、审查、依赖、证据、安装预览和 CLI 参数是本地能力，不需要上游全部依赖。Codex 才是工作执行器。

上游 CLI/MCP 需要已安装/构建运行时及实际配置；每个 handler 还可能需要可选库、二进制、账户、网络或模型。仅在当前工具真实可用且授权匹配时调用。登记、启动、健康、实际执行、结果验收分别需要证据。

特别注意：上游 `agent_spawn` 只登记；`coordination_orchestrate` executor 为 none；部分 sync 模拟；swarm 状态文件不是活跃原生 worker。`agent_execute` 和 managed-agent 路线依赖 Anthropic。不要把这些当 Codex 原生执行。

Codex 的宿主原生子代理与 CLI `codex exec` 不同；此 skill 不把 API 工具名写死，不创建另一聊天或假装启动 federation/swarm。查看会话实际 tools 后才分配独立只读调查。

Claude 专属 UI/mods、Claude hook 事件、POSIX 脚本、自动 PermissionRequest 放行不直接迁移。保留旧双平台入口供显式配置，不把其自动下载/自动注册行为带入新默认路径。

AgentDB/RuVector/神经训练/联邦/浏览器/第三方 API 的运行验证需要具体依赖与授权。完整兼容结论必须基于版本化逐项矩阵和真实注册/运行证据；源码关键词或本 skill 的安装不能提供此保证。
