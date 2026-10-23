# 安装与日常使用

[返回 README](../README.md) · [兼容条件](COMPATIBILITY.md) · [详细 CLI 参考](../skills/codex-task-harness/references/runtime.md)

## 准备

普通核心需要 Node.js；本项目已有 Windows / Node v26.12.1 行为证据。完整测试还需要 python、pwsh 和相应文件系统能力。没有第三方 npm 依赖，不需要 npm install。

```powershell
git clone https://github.com/Frrrrred/codex-task-harness.git
cd codex-task-harness
npm run check:skill
npm run help
```

下面 PowerShell 示例从克隆后的仓库根执行。安装目标按你的实际 Codex 环境选择：

```powershell
$repoRoot = (Get-Location).Path
$cli = Join-Path $repoRoot 'skills/codex-task-harness/scripts/harness.mjs'
$harnessCodexHome = Join-Path $HOME '.codex'
$harnessSkillsRoot = Join-Path $HOME '.agents/skills'
$installPlanFile = Join-Path ([IO.Path]::GetTempPath()) ('codex-task-harness-install-' + [guid]::NewGuid() + '.json')

node $cli install-preview --codex-home $harnessCodexHome --skill-root $harnessSkillsRoot --out $installPlanFile
if ($LASTEXITCODE -ne 0) { throw 'Installation preview failed' }
Get-Content -LiteralPath $installPlanFile -Raw
```

--skill-root 是父 skills 目录，运行时会追加 codex-task-harness。安装源由所调用 CLI 所在技能目录决定，必须使用仓库的 skills/codex-task-harness/scripts/harness.mjs。--out 排他创建预览文件，不覆盖既有文件。

逐项审查 targetSkill、codexHome、changes、digest 和 summary：确认只会安装技能文件并处理指定 AGENTS 的托管规则。预览不会自动应用，也不授权覆盖不同现有技能。若确实要替换不同内容，先审查目标，再用新的预览文件显式添加 --replace-skill；install 不接收该开关。

## 应用已经审查的预览

确认用户批准精确变更后，才运行：

```powershell
$installText = node $cli install --plan $installPlanFile
if ($LASTEXITCODE -ne 0) { throw 'Installation failed; inspect the original diagnostics' }
$installation = ($installText -join [Environment]::NewLine) | ConvertFrom-Json
$installation
```

成功安装返回 status=installed 和 rollbackManifest；already-installed 表示没有本次变更，不能假定有新回退清单。apply 会重新核对源与目标，漂移会拒绝。

安装保留个人 AGENTS 原文，在无托管块时追加；已有块必须唯一且符合目标路径，差异会要求检查。非空 AGENTS.override.md 遮蔽也会被拒绝。安装不会修改 config.toml、模型或其他技能。

需要显式回退且已审查其影响时，使用本次真实返回的清单：

```powershell
if ($installation.status -ne 'installed' -or -not $installation.rollbackManifest) {
    throw 'No rollback manifest from an applied installation'
}
node $cli rollback --manifest $installation.rollbackManifest
if ($LASTEXITCODE -ne 0) { throw 'Rollback failed; retain diagnostics and the manifest' }
```

清单不是预览文件。回退先核对身份和内容，拒绝用户漂移；可能部分完成，不能依据非零退出自动重试或删备份。详见[安装与回退语义](../skills/codex-task-harness/references/runtime.md#安装与回退)。

## 在新会话调用

安装后新建 Codex 会话，使用 $codex-task-harness 显式调用；技能的 allow_implicit_invocation 保持 true，也可根据任务自动选择。以下提示词需要替换实际任务或入口，不含伪造批准。

### 日常提示词

新任务：

```text
使用 $codex-task-harness 完成以下任务：……
先准备完整总控、全部主要阶段、共享协议、恢复和验收，
展示完整方案等待我审查。批准后按依赖连续推进，
最后报告实际改动、验证证据、兼容影响和未解决项。
```

旧包续接：

```text
续接任务，入口为 [填写现有 HARNESS.md 的绝对路径]。
先读总控和恢复，随后取 context；按当前批准、依赖、
active execution 和最近验收选择动作。保留原 runId，
只为具体证据缺口回读历史，不重新建包或重审清空工作。
```

验收失败：

```text
处理当前任务的验收失败。结合 context.currentStatus 与最近验收摘要，
区分实质标准失败、前置/执行门禁拒绝和真实证据漂移。
保留失败记录，安排必要返工和受影响复验。
仍有效的旧 verified 不因一次拒绝就视为失效。
```

异常恢复：

```text
按原任务入口恢复异常运行。先确认原进程是否实际结束，
保留原 step/runId 与真实执行事实。只有确认结束后才 submit；
完整同事实回执可按原模式重放。失效结果只作 stale 事实闭合，
不得靠删除回执、自动清锁、重启或新批准遮蔽未结束运行。
```

## CLI 路线

通常由 Codex 按技能准备完整包和执行；以下是阅读运行时所用的接口顺序，不是可直接授权工作的自动脚本。

```text
draft → 填完整 contract → refs → 写实质阶段与恢复
→ prepare-review → 向最终用户展示完整包
→ 收到真实批准后 decision
→ context → begin → 宿主实际工作并确认结束
→ 按 begin 返回的 submission 内联 submit → verify
```

--project 应为实际绝对项目路径。新建 draft 只是骨架；prepare-review 的路径/机器检查不证明语义正确。初建未审 draft 可使用 --repair-output-refs；已审包修订按实际 refs --next 的动作处理。

prepare-review 默认输出 JSON，可读取 review.taskId、review.revision、review.digest；加 --handoff-only 时成功输出 Markdown，不要再将其当 JSON。批准记录必须来自当前完整版本的真实最终用户回复，不能预填 approve 冒充授权。

begin 返回真实 runId 及 submission 命令；普通宿主使用 executor=codex-native。submit --result 仅 ok 或 failed，不会停止进程，也不直接验证任务。review 类型标准还需要按 criterion ID 提供实际审查证据，不能假装独立人员审查。

详细参数、外部授权根、原回执恢复和状态分支以[运行接口](../skills/codex-task-harness/references/runtime.md)为准。doctor 会创建临时证据，不属于无文件写入的检查；run 可能调用额外模型，不作为默认安装验证。
