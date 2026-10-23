# 贡献指南

请先阅读 [README](README.md)、[架构](docs/ARCHITECTURE.md)、[兼容边界](docs/COMPATIBILITY.md)和[来源说明](ATTRIBUTION.md)。

## 提交问题

使用仓库的 [Issues](https://github.com/Frrrrred/codex-task-harness/issues)，提供明确目标、复现步骤、实际与预期行为、Node/系统/文件系统环境和脱敏证据。安全问题按 [SECURITY](SECURITY.md)处理。

## 修改边界

- 技能逻辑放在 skills/codex-task-harness；仓库介绍、CI 和开发文档留在技能外。
- 变更聚焦实际问题，说明影响的状态、入口、兼容分支和验收标准。
- 保留 MIT 通知和可核实的来源；不要从当前渲染器重新生成旧金样来让兼容测试通过。
- schemaVersion、templateVersion、任务 revision 是有效接口。涉及状态或模板迁移时，审查旧包批准、pending_acceptance、verified、active run、事实闭合及异常组合。
- 测试批准/进程是 SYNTHETIC，不把它们当作真实用户授权或实际模型运行。
- 不提交个人规则、凭据、聊天、工作现场、安装备份或测试日志。

## 本地验证

核心不需要 npm install。在仓库根运行：

```powershell
npm run check:skill
npm run help
npm run help:submit

$workRoot = Join-Path ([IO.Path]::GetTempPath()) ('codex-task-harness-test-' + [guid]::NewGuid())
npm test -- --work-root $workRoot
if ($LASTEXITCODE -ne 0) { throw 'Main regression failed' }
```

--work-root 必须是你明确允许创建测试夹具的绝对目录。完整测试还使用 Python、pwsh、链接/ACL/NTFS 流能力，参见[验证说明](docs/VALIDATION.md)。结果在该根的 fixtures 子目录中，报告明确选择、实际总数、失败和准备重试；完整数量必须与 CI 的精确门禁一致，用例 ID 不得缺失或重复。不要用筛选子集或静默跳过不支持场景冒充全套通过。

检查文档链接、公开命令和安装预览边界。涉及执行/恢复时，补覆盖完整生命周期、组合状态和故障恢复的行为证据。退出零、文件非空或正向样例不替代验收。

**84 项跨运行时升级需要单独、真实且摘要匹配的冻结外部基线。当前未执行。** 不用当前包、教程版本或临时生成的旧实现替代它，不将既有结果写成新一轮通过。

## Pull request

说明具体问题、最终行为、实际验证、未执行项和兼容影响；保留失败和负结果。CI 失败时先查原始日志再判断原因，不通过删断言、伪造固定金样或弱化门禁来取得绿色结果。
