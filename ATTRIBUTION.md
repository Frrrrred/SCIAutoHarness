# 来源与许可

## learn-claude-code：工程设计参考

本项目基于 [shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) 教程中的 Harness 工程原则，面向 Codex 的实际使用方式开发与复核。

文档参考固定到教程提交 [ce8f9f186058939da54c9d6fead78dfb5d0fd6c3](https://github.com/shareAI-lab/learn-claude-code/tree/ce8f9f186058939da54c9d6fead78dfb5d0fd6c3) 的根目录 s01–s17，核实日期为 2026-10-23。该教程提交不是跨运行时升级测试的冻结基线。

参考重点是工具与权限边界、按需知识加载、上下文纪律、任务依赖、可恢复执行和整体目标闭合。各章与本项目的关系见[教程对应](docs/LEARN_CLAUDE_CODE.md)。这些属于设计参考；本项目不宣称直接复制或 fork 了教程的完整 Python Agent，也不宣称实现了课程的所有服务。

教程采用 MIT，原署名为 Copyright (c) 2024 shareAI Lab。[上游许可](https://github.com/shareAI-lab/learn-claude-code/blob/ce8f9f186058939da54c9d6fead78dfb5d0fd6c3/LICENSE)的文本保留在[教程许可文件](third_party/learn-claude-code.LICENSE)。

## 代码许可与兼容证据

代码保留既有 Copyright (c) 2024-2026 ruvnet 的 MIT 版权通知。根 [LICENSE](LICENSE) 和技能内 [LICENSE](skills/codex-task-harness/LICENSE)均保留该通知及完整许可文本；保留通知不表示本产品依赖其他工具或服务。

旧受审模板的历史正文、冻结渲染金样与来源摘要，以及既有 CLI 诊断字段作为兼容接口保留原值。它们只用于解释旧任务和验证兼容性，不是当前产品的安装依赖、集成说明或能力承诺。新任务及新安装生成的文本使用本产品名称和通用权限规则。

## 仓库新增内容

仓库介绍、使用与架构说明、来源映射、贡献/安全说明及 CI 配置由 codex-task-harness contributors 维护，按根 MIT 许可证提供。仓库文档与 CI 位于技能目录之外。

测试金样中的 SYNTHETIC 标记和来源摘要用于测试溯源；摘要本身不证明作者身份，也不能重建一个可信旧运行时。

## 项目关系

本项目不是 OpenAI 或 shareAI Lab 的官方产品，不使用这些名称表示背书。产品主张以现有实现及[实际验证范围](docs/VALIDATION.md)为准。
