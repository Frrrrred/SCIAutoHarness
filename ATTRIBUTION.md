# 来源与许可

## learn-claude-code：工程设计参考

本项目基于 [shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) 教程中的 Harness 工程原则，面向 Codex 的实际使用方式开发与复核。

本次公开文档引用固定到教程提交 [ce8f9f186058939da54c9d6fead78dfb5d0fd6c3](https://github.com/shareAI-lab/learn-claude-code/tree/ce8f9f186058939da54c9d6fead78dfb5d0fd6c3)，核实日期为 2026-10-23。对应当前根目录 s01–s17，而非旧的 12 课过渡资料。该引用版本不代表本项目过去每次阅读所使用的本地提交，也不是跨运行时升级测试的冻结基线。

参考重点是工具与权限边界、按需知识加载、上下文纪律、任务依赖、可恢复执行和整体目标闭合。各章与本项目的关系见[教程对应](docs/LEARN_CLAUDE_CODE.md)。这些属于设计参考；本项目不宣称直接复制或 fork 了教程的完整 Python Agent，也不宣称实现了课程的所有服务。

教程采用 MIT，原署名为 Copyright (c) 2024 shareAI Lab。[上游许可](https://github.com/shareAI-lab/learn-claude-code/blob/ce8f9f186058939da54c9d6fead78dfb5d0fd6c3/LICENSE)的文本保留在[教程许可文件](third_party/learn-claude-code.LICENSE)。

## 既有 Ruflo / Codex 本地实现

公开仓库以现有 codex-task-harness 技能为代码基准，保留 27 个技能文件的原始字节，包括 LICENSE、运行时、测试与固定模板金样。既有许可证为 Copyright (c) 2024-2026 ruvnet，MIT；根 [LICENSE](LICENSE) 和技能内 [LICENSE](skills/codex-task-harness/LICENSE)均保留该通知。

CLI 中的 Ruflo Codex native harness 文字、模板中的相关来源语境和 [Ruflo 兼容说明](skills/codex-task-harness/references/ruflo-compatibility.md)保留。它们不构成对当前 Ruflo 所有上游功能的兼容承诺。本地核心直接使用 Node 内置模块，不需要安装整个 Ruflo，也不会自动转用 Claude 或下载另一套编排。

## 仓库新增内容

仓库介绍、使用与架构说明、来源映射、贡献/安全说明及 CI 配置由 codex-task-harness contributors 维护，按根 MIT 许可证提供。它们位于技能目录之外，不增加安装负担或改变运行时行为。

未公开个人 AGENTS、配置、聊天、凭据或任务现场。测试金样中的 SYNTHETIC 标记和来源摘要用于测试溯源；摘要本身不证明作者身份，也不能重建一个可信旧运行时。

## 项目关系

本项目不是 OpenAI、Anthropic、Ruflo 或 shareAI Lab 的官方产品，不使用这些名称表示背书。产品主张以现有实现及[实际验证范围](docs/VALIDATION.md)为准。
