# Installation and daily use

[README](../README.md) · [Hosts](HOSTS.md) · [Compatibility](COMPATIBILITY.md)

## Prepare

Use an existing Node.js environment and an available agent host. The core uses built-in modules and bundled code; no `npm install` is required. Host installation and provider setup remain separate.

```powershell
git clone https://github.com/Frrrrred/SCIAutoHarness.git
cd SCIAutoHarness
$cli = Join-Path (Get-Location).Path 'skills/sciautoharness/scripts/harness.mjs'
node $cli help
```

## Preview and review installation

For Codex, select its instruction home and the parent skill directory:

```powershell
$harnessHome = Join-Path $HOME '.codex'
$harnessSkills = Join-Path $HOME '.agents/skills'
$harnessPlan = Join-Path ([IO.Path]::GetTempPath()) ('sciautoharness-' + [guid]::NewGuid() + '.json')
node $cli install-preview --host codex --host-home $harnessHome --skill-root $harnessSkills --out $harnessPlan
if ($LASTEXITCODE -ne 0) { throw 'Retain the preview diagnostics' }
Get-Content -LiteralPath $harnessPlan -Raw
```

Review every target, its content and identity, the instruction change, source, digest and recovery effect. The skill root is the parent directory. The preview contains the formal skill and compatibility entries. A preview does not change the installation or grant approval.

Different installed content needs a fresh preview with `--replace-skill`. A recognized full installation additionally needs `--migrate-legacy`. Extra files, custom managed rules, nearby instruction overrides or unsafe identities require explicit treatment; these options do not bypass safeguards. Keep the diagnostics and originals instead of editing a preview to make it pass.

After the exact preview receives approval:

```powershell
node $cli install --plan $harnessPlan
```

Keep the returned backup and rollback manifest. `already-installed` means no new changes or manifest were needed. Source or target drift requires a fresh review. A completed installation can be rolled back only after reviewing and authorizing the exact effect:

```powershell
node $cli rollback --manifest '<manifest returned by the completed installation>'
```

Interrupted or partial operations need diagnosis using the retained manifest, journal and originals. A nonzero exit alone does not prove that no files changed.

## Use a task

In a new Codex session, invoke `$sciautoharness`. Complex work receives a complete plan before execution; simple questions and isolated low-risk edits can proceed directly.

```text
请使用 $sciautoharness 为这项科研任务准备完整方案：……
使用已有的 research-sci 环境，明确数据来源、输入输出目录、参数、
必要权限和验收标准。先提交完整方案供我审查，批准后再执行。
```

Use the existing environment without changing it:

```powershell
conda run -n research-sci python '<authorized script>' '<required argument>'
```

The runtime can draft a local task package for the host to complete:

```powershell
node $cli draft --project '<absolute project directory>' --id research-task --goal '<intended result>' --domain research --layout layered --host codex
```

The host fills the complete contract, phases, protocols and recovery instructions, checks their paths and presents the whole plan for human review. Scaffolding is not approval. After approval, work advances by accepted dependencies. Each stage reports actual changes, evidence, compatibility and unresolved issues.

## Resume original work

```text
请恢复这个原任务：<HARNESS.md 的绝对路径>。
先读 master 和 recovery，再取得当前 context。使用现有批准、
已验收依赖和原 run 身份；只为具体缺口读取历史原始证据。
```

An interrupted process must be observed to its actual end before factual submission. Preserve the original run, host and executor. Acceptance failures require focused repair and revalidation. A stale factual closure does not restore approval or make old evidence current.

See [host profiles](HOSTS.md) for other hosts and the [runtime reference](../skills/sciautoharness/references/runtime.md) for exact command contracts.
