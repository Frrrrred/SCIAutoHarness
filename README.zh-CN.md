# SCIAutoHarness

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Español](README.es.md)

**Scientific Automation Harness**，面向科研的自动化驾驭工程。

SCIAutoHarness 在智能体宿主中运行，将复杂科研任务组织为完整计划、人工审批、依赖推进、证据验收和原运行恢复。研究结论与实际来源、参数和执行证据关联，方便在跨会话工作中继续推进。

## 开始使用

使用已有的 Node.js 环境和智能体宿主。核心仅使用 Node.js 内置模块，无需安装依赖。

```powershell
git clone https://github.com/Frrrrred/SCIAutoHarness.git
cd SCIAutoHarness
npm run help
```

按[安装与日常使用](docs/GETTING_STARTED.md)生成安装预览，审查具体目标后再应用。在新的 Codex 会话中调用 `$sciautoharness`。

## 完成一项任务

1. 明确结果、来源、权限和验收标准。
2. 审查完整计划，再开始执行。
3. 按已验收的依赖推进阶段，保留实际证据。
4. 通过原入口恢复，保留批准和原 run 身份。

简单问答和孤立的低风险编辑可直接处理。科研任务还需明确数据来源、参数选择、不确定性，以及下游使用前必须完成的检查。

```text
请使用 $sciautoharness 为以下科研任务准备完整计划：……
使用已有的 research-sci 环境，明确输入、输出、权限和验收标准。
先交付完整方案供我审查，批准后按依赖推进并保留证据。
```

## 宿主与权限

提供 Codex、Claude Code 和 DeepSeek Harness 的宿主配置。技能发现、凭据和模型调用由所选宿主管理。安装技能不会安装宿主、配置提供器或自动批准外部操作。详见[宿主说明](docs/HOSTS.md)和[兼容性](docs/COMPATIBILITY.md)。

## 文档

- [安装与日常使用](docs/GETTING_STARTED.md)
- [架构](docs/ARCHITECTURE.md)
- [宿主说明](docs/HOSTS.md)
- [兼容性](docs/COMPATIBILITY.md)
- [参与贡献](CONTRIBUTING.md)与[安全说明](SECURITY.md)

## 许可与来源

采用 [MIT 许可](LICENSE)。来源通知与设计参考见[来源说明](ATTRIBUTION.md)。
