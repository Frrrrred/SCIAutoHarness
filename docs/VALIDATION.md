# 验证记录

[返回 README](../README.md) · [兼容边界](COMPATIBILITY.md) · [贡献与复测](../CONTRIBUTING.md)

验证日期：2026-10-23（Asia/Shanghai）。本页记录本次完整仓库打包后的本地实际执行；远端运行另见 [Windows CI](https://github.com/Frrrrred/codex-task-harness/actions/workflows/validate.yml)。

## 本次本地结果

| 检查 | 实际结果 |
| --- | --- |
| 完整主回归 | **342/342 通过，0 失败**；selection=all，实际退出 0 |
| 结果完整性 | 342 条记录、342 个唯一非空 ID、逐项 pass=true；顺序与正式套件一致 |
| 夹具准备重试 | 0 次 |
| 模块语法 | 14 个模块全部通过 node --check |
| 技能校验 | 包内 check-skill 与宿主 quick_validate 均通过 |
| 仓库根脚本 | check:skill、help、help:submit 实际运行成功；test 实际调用完整主套件 |
| 独立安装检查 | 预览 28 个目标：27 技能文件及 AGENTS；未纳入根 README、CI 或其他仓库文件 |
| 安装与回退 | 技能字节一致；BOM/CRLF/中文/无末尾换行的合成 AGENTS 原文保留，回退后完整恢复；合成配置未改变 |
| 核心文件 | 嵌套技能 27 文件与正式源逐项字节一致，金样的 24 项来源摘要保留 |
| 文档与配置 | 公开链接/锚点、来源说明、许可证及 CI 配置已检查 |

实际环境为 Windows / Node **v26.12.1**、Python **3.14.7**、PowerShell **7.6.7**。主套件实际使用链接、ACL 和 NTFS 命名流；它们没有被跳过。没有调用真实模型或安装 npm 依赖。

补充安装检查曾将 backupPreserved 错当布尔值；实际字段是保留的备份目录路径。纠正该检查预期后，核实已完成的回退清单与恢复字节；没有再次执行安装或回退，也没有修改产品实现。该检查错误与 342 项主回归结果分别记录。

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

必须实际读取本轮 fixtures 子目录中的 regression-results.json；同时检查套件名、selection=all、342/342/0、结果数量、每项 pass、非空与唯一 ID，不能只根据退出码或日志中的数字判断。--case-prefix 是定向诊断工具，筛选结果不能作为完整套件通过。

本次原始结果 JSON 的 SHA-256：

```text
b130ec8be3568d7a356d2817eae5d8df6d65a360fc742c8284c90a8883ae763a
```

本次顺序 ID 清单的 SHA-256（UTF-8 JSON.stringify(ids)）：

```text
24b481cc40025208201b002def1cf543f12d5b72154317945fef38864cc254b7
```

这些摘要用于识别本次实际记录，不单独证明来源真实性或正确性。原始结果包含机器本地路径，仅在维护者本地验证记录保留；公开仓库不收录个人规则、任务现场、私有日志或凭据。

## CI 与未执行边界

Windows CI 固定官方 checkout、setup-node 的完整提交，配置 Node 26、只读 contents 权限、不持久化凭据和不必要缓存；每条原生命令立即检查退出码，并独立核对完整 342 条结果。实际补丁版本、镜像和运行结果以对应 CI 日志为准。本页不把本地通过冒称为远端通过。

**84 项跨运行时升级回归未执行。** 所需匹配的冻结外部基线已删除。当前主套件中的固定模板全文比较，以及升级套件的静态场景保留，都不替代真实旧运行时创建任务后再由当前运行时续接的升级测试。没有下载、重建或用当前包冒充旧基线。

本次验证不建立其他 OS、所有 Node 版本、最低 Node 版本、真实额外模型运行、全部上游 Ruflo 功能或完整教程机制的兼容保证。更多边界见 [COMPATIBILITY](COMPATIBILITY.md)。
