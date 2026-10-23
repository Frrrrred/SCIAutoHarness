# 验证记录

[返回 README](../README.md) · [兼容边界](COMPATIBILITY.md) · [贡献与复测](../CONTRIBUTING.md)

验证日期：2026-10-23（Asia/Shanghai）。本页记录当前代码的本地实际验证；远端运行及其提交另见 [Windows CI](https://github.com/Frrrrred/codex-task-harness/actions/workflows/validate.yml)。本地通过不代表任意其他提交或环境已经通过。

## 本次本地结果

| 检查 | 实际结果 |
| --- | --- |
| 完整主回归 | **399/399 通过，0 失败**；selection=all，实际退出 0 |
| 用例保留 | 原 342 个用例 ID 全部保留，新增 57 个 ID 无缺失或冲突 |
| 结果完整性 | 399 条记录、399 个唯一非空 ID、逐项 pass=true |
| 夹具准备重试 | 0 次 |
| 模块语法 | 14 个模块全部通过 node --check |
| 技能校验 | 包内 check-skill 与通用技能格式校验均通过 |
| 仓库根脚本 | check:skill、help、help:submit 实际运行成功；test 实际调用完整主套件 |
| 模板与恢复 | v1/v2 金样全文一致；新默认模板 3；主套件覆盖缺省/1/2 × 两布局 × 四状态及回执故障、审批/依赖漂移 |
| 额外本地旧运行时续接 | 修改前公开运行时实际创建的 24 个旧状态检查点，全部由当前代码续接到 verified；原批准、runId、契约/总控及已有回执保真 |
| 额外本地旧安装拒绝 | 使用原运行时的规则生成器及旧资源，6 个组合全部安全拒绝，目标内容/身份及配置未变 |
| 独立 CLI 安装 | preview/install/rollback 三条真实 CLI 均退出 0；预览 28 个目标：27 技能文件及 AGENTS，未纳入仓库根文档或 Git 元数据 |
| 安装与回退 | 两个主套件独立安装根及独立 CLI 检查通过；BOM/CRLF/中文/无末尾换行原文与身份保留，回退后完整恢复；合成配置未改变 |
| 冻结来源 | v1 金样及其 24 项来源摘要未改；v2 两例金样由修改前公开运行时捕获，保留 27 项来源摘要 |
| 文档与配置 | 公开链接/锚点、来源说明、许可证及 CI 配置已检查 |

实际环境为 Windows / Node **v26.12.1**、Python **3.14.7**、PowerShell **7.6.7**。主套件实际使用链接、ACL 和 NTFS 命名流；它们没有被跳过。没有调用真实模型或安装 npm 依赖。

额外本地续接的源为公开提交 [cc5bef261bdb276c763981279ba15189ced63d04](https://github.com/Frrrrred/codex-task-harness/commit/cc5bef261bdb276c763981279ba15189ced63d04)。这些检查使用真实源文件及原状态现场。CI 的永久主套件通过冻结金样和显式旧版本夹具持续检查兼容接口；它不重新创建上述本地旧运行时现场。

## 执行方法与证据

在克隆仓库根、明确授权的全新绝对测试目录执行：

```powershell
npm run check:skill
npm run help
npm run help:submit

$workRoot = Join-Path ([IO.Path]::GetTempPath()) ('codex-task-harness-test-' + [guid]::NewGuid())
npm test -- --work-root $workRoot
if ($LASTEXITCODE -ne 0) { throw 'Main regression failed' }
```

必须实际读取本轮 fixtures 子目录中的 regression-results.json；同时检查套件名、selection=all、399/399/0、结果数量、每项 pass、非空与唯一 ID，不能只根据退出码或日志中的数字判断。--case-prefix 是定向诊断工具，筛选结果不能作为完整套件通过。

本次原始结果 JSON 的 SHA-256：

```text
63046ac97c3deefef2f5d1c48b747d9aca65a9860650fbbb6e75cbfb45265526
```

本次顺序 ID 清单的 SHA-256（UTF-8 JSON.stringify(ids)）：

```text
a4cc9efaa58e8f89537e045631f8c9186dcdf2079160837b76ee2a1c411e99cc
```

这些摘要用于识别本次实际记录，不单独证明来源真实性或正确性。原始结果包含机器本地路径，仅在维护者本地验证记录保留；公开仓库不收录个人规则、任务现场、私有日志或凭据。

## CI 与未执行边界

Windows CI 固定官方 checkout、setup-node 的完整提交，配置 Node 26、只读 contents 权限、不持久化凭据和不必要缓存；每条原生命令立即检查退出码，并独立核对完整 399 条结果。实际补丁版本、镜像和运行结果以对应 CI 日志为准。本页不把本地通过冒称为远端通过。

**84 项跨运行时升级回归未执行。** 所需匹配的外部冻结基线当前不可用。主套件、金样比较、额外 24 项当前公开基准续接及 6 项旧安装检查均不替代该套件；没有下载、重建或用其他代码冒充其匹配基线。

本次验证不建立其他 OS、所有 Node 版本、最低 Node 版本、真实额外模型运行或完整教程机制的兼容保证。更多边界见 [COMPATIBILITY](COMPATIBILITY.md)。
