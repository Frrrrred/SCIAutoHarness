# Installation and daily use

[README](../README.md) · [Hosts](HOSTS.md) · [Compatibility](COMPATIBILITY.md)

## Prepare

Use an existing Node.js environment and agent host. Repository CI uses Node 26. The core uses Node.js built-ins and needs no npm dependency installation. Windows installation also requires an existing PowerShell that can enumerate file and directory alternate streams. Host installation and provider setup remain separate.

Clone into a new directory. Before replacing an existing installation or a checkout used by active work, read [compatibility and upgrades](COMPATIBILITY.md).

```powershell
git clone https://github.com/Frrrrred/SCIAutoHarness.git
cd SCIAutoHarness
$cli = Join-Path (Get-Location).Path 'skills/sciautoharness/scripts/harness.mjs'
node $cli help
```

## Preview and review installation

A preview includes complete instruction-file bytes. Keep it private. The CLI's external preview file and stdout are the caller's responsibility; the installer's private transaction storage does not protect them retroactively.

Choose an existing access-controlled directory whose owner and effective permissions you have checked. Replace the placeholder below with that directory. A random filename or an ordinary temporary directory alone is not a privacy guarantee.

```powershell
$harnessHome = Join-Path $HOME '.codex'
$harnessSkills = Join-Path $HOME '.agents/skills'
$harnessPrivateDirectory = '<existing private directory>'
if (!(Test-Path -LiteralPath $harnessPrivateDirectory -PathType Container)) {
    throw 'Choose and verify private storage before creating a preview'
}
$harnessPlan = Join-Path $harnessPrivateDirectory ('sciautoharness-' + [guid]::NewGuid() + '.json')
node $cli install-preview --host codex --host-home $harnessHome --skill-root $harnessSkills --out $harnessPlan > $null
if ($LASTEXITCODE -ne 0) { throw 'Retain preview diagnostics privately' }
```

Review the plan locally in a trusted private viewer: exact source and targets, before/after bytes and identities, managed-rule change, digest and recovery effect. Do not put the full plan or personal instruction bytes in public logs or issues. An agent can instead hold the programmatic preview in memory through exact review and apply.

The skill root is the parent of the installed sciautoharness directory. The current package has exactly 34 inventoried members. Different recognized content requires a fresh preview with --replace-skill. Unknown or extra files, unsafe identities, nearby instruction overrides and unreviewed custom rules refuse the operation. A reviewed managed-block replacement uses the programmatic API's exact reviewedRule.before/after pair; this is not a CLI flag.

Old template and installation formats are not automatically converted. If an old installation fails the strict inventory, preserve it and its matching controller. Use its supported recovery route or a separately reviewed retirement plan; do not delete files or edit a plan to make validation pass.

After the exact preview receives approval:

```powershell
node $cli install --plan $harnessPlan
```

Retain the reviewed plan, backup and rollback manifest privately. Already-installed means no changes and no new manifest. Source or target drift requires fresh review. Normal rollback accepts only a complete current installed transaction with its intact plan, backups, targets and metadata, after approval of the exact restoration:

```powershell
node $cli rollback --manifest '<manifest from the completed current installation>'
```

Prepared, partial, unconfirmed or unsupported records require recovery with their original facts. A nonzero exit does not establish that no file changed. Do not automatically retry or perform ordinary rollback of a partial transaction.

## Use a task

In a new Codex session, invoke $sciautoharness. Complex work receives a complete plan before execution; simple questions and isolated low-risk edits can proceed directly.

```text
请使用 $sciautoharness 为这项科研任务准备完整方案：……
使用已有的 research-sci 环境，明确数据来源、输入输出目录、参数、
必要权限和验收标准。先提交完整方案供我审查，批准后再执行。
```

Use the existing scientific environment without changing it:

```powershell
conda run -n research-sci python '<authorized script>' '<required argument>'
```

The runtime can draft the fixed layered package for the host to complete:

```powershell
node $cli draft --project '<absolute project directory>' --id research-task --goal '<intended result>' --domain research --host codex
```

The host fills the complete contract, substantive phases, protocols and recovery, checks their paths and presents the whole plan for human review. Scaffolding is not approval. Work then advances through accepted dependencies.

Clarification starts with settled decisions and the consequential unknowns that remain. The agent checks accessible facts itself and asks dependency-ordered questions with a recommendation and its tradeoff. Before expanding dependent work, it checks the earliest premise that could refute the route. An additional method needs an unmet acceptance requirement and an exit condition. A local success does not by itself release the whole stage.

At each substantive stage handoff, expect a short plain-language account of the result, decisive evidence and remaining limits, followed by the next stage's concrete tasks and two or three relevant questions. The agent waits for an actual reply before starting the next stage; silence and displayed default options are not replies. The final stage still asks for delivery feedback without inventing further work. These goal-alignment and dialogue rules are included in the skill and do not require a separate grill-me installation.

Ordinary direction feedback is separate from technical acceptance. Material changes to the approved goal, inputs, methods, permissions, resources or acceptance criteria require review of a complete revised plan. The agent host follows the conversational wait; the CLI does not enforce unanswered questions as a machine gate. See [compatibility](COMPATIBILITY.md).

## Resume original work

```text
请恢复这个原任务：<HARNESS.md 的绝对路径>。
先读 master 和 recovery，再取得当前 context。使用现有批准、
已验收依赖和原 run 身份；只为具体缺口读取历史原始证据。
```

Keep the controller that began the task; do not switch it to this runtime to guess unsupported old state. Spawned CLI close records process observation. The original controller separately establishes actual business end, including relevant owned activity, and submits the same run with actual end evidence. Receipt publication or exit zero alone is not acceptance.

Changed closed pending, verified or stale results require supported rework before repair; failed execution has its direct retry route. Administrative recovery does not restore approval. See [host profiles](HOSTS.md) and the [runtime reference](../skills/sciautoharness/references/runtime.md).
