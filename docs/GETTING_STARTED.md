<a id="安装与日常使用"></a>
# Installation and daily use

[README](../README.md) · [Host profiles](HOSTS.md) · [Compatibility](COMPATIBILITY.md) · [Runtime reference](../skills/codex-task-harness/references/runtime.md)

<a id="准备"></a>
## Prepare

The core uses Node.js built-ins and bundled modules. The established local baseline is Windows / Node v26.12.1. Full tests additionally use Python, pwsh and the filesystem capabilities listed in [VALIDATION](VALIDATION.md). Core usage needs no `npm install`.

```powershell
git clone https://github.com/Frrrrred/codex-task-harness.git
cd codex-task-harness
npm run check:skill
npm run help
```

Use an already available host. Installing this skill does not install Codex, Claude Code or DSH, configure a provider, or grant model-call permission.

## Preview the selected host installation

This PowerShell example runs from the cloned repository root. Choose a host and use your actual roots:

```powershell
$repoRoot = (Get-Location).Path
$cli = Join-Path $repoRoot 'skills/codex-task-harness/scripts/harness.mjs'
$harnessHost = 'codex'
switch ($harnessHost) {
    'codex' {
        $harnessHostHome = Join-Path $HOME '.codex'
        $harnessSkillRoot = Join-Path $HOME '.agents/skills'
    }
    'claude-code' {
        $harnessHostHome = Join-Path $HOME '.claude'
        $harnessSkillRoot = Join-Path $harnessHostHome 'skills'
    }
    'deepseek-harness' {
        $harnessHostHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
        $harnessSkillRoot = Join-Path $harnessHostHome 'skills'
    }
    default { throw 'Unknown host profile' }
}
$installPlanFile = Join-Path ([IO.Path]::GetTempPath()) ('codex-task-harness-install-' + [guid]::NewGuid() + '.json')
node $cli install-preview --host $harnessHost --host-home $harnessHostHome --skill-root $harnessSkillRoot --out $installPlanFile
if ($LASTEXITCODE -ne 0) { throw 'Installation preview failed' }
Get-Content -LiteralPath $installPlanFile -Raw
```

`--skill-root` is the parent; the installer appends `codex-task-harness`. The invoked nested CLI determines the source. `--out` creates its file exclusively. Host defaults to `codex`; `--codex-home` remains its home alias. Do not combine the home aliases.

Review the host, canonical roots, fixed instruction target, `targetSkill`, every change, digest and summary. The instruction filename is `AGENTS.md` for Codex and DSH, and `CLAUDE.md` for Claude Code. New plans use `safetyVersion: 2`.

A preview does not apply changes or authorize replacement. To replace differing content, review the exact target and create a fresh preview with `--replace-skill`; `install` does not take that option. Different managed blocks, extra installed files, unsafe links, unreliable identities or nearby instruction sources may require review. Replacement does not bypass those checks. The installer does not silently migrate old content.

<a id="应用已经审查的预览"></a>
## Apply an approved preview

After the user approves the exact preview:

```powershell
$installText = node $cli install --plan $installPlanFile
if ($LASTEXITCODE -ne 0) { throw 'Installation failed; retain original diagnostics' }
$installation = ($installText -join [Environment]::NewLine) | ConvertFrom-Json
$installation
```

Success returns `installed` and a `rollbackManifest`. `already-installed` means no changes were made and need not supply a new manifest. Source or target drift requires a fresh preview.

Existing instruction bytes are retained. A missing block is appended; an existing block must be unique and match the profile and target. Unsupported encodings are refused. A nonempty Codex `AGENTS.override.md` shadows the target; other profiles conservatively require review of the named nearby local instruction files without asserting equivalent override semantics. Models, providers and unrelated settings are not configured.

## Roll back an installation

Review the effect and use the actual manifest from a completed installation:

```powershell
if ($installation.status -ne 'installed' -or -not $installation.rollbackManifest) {
    throw 'No rollback manifest from an applied installation'
}
node $cli rollback --manifest $installation.rollbackManifest
if ($LASTEXITCODE -ne 0) { throw 'Retain diagnostics, backups and the manifest' }
```

A rollback manifest differs from a preview. Rollback checks content, identities, roots and backups before restoring targets. Either operation can partially change files; a nonzero exit does not prove no writes.

Complete legacy Codex safety1 manifests retain their safe rollback path. Old previews need a fresh safety2 preview and review; do not edit safety fields to reuse them. See the [runtime installation rules](../skills/codex-task-harness/references/runtime.md).

<a id="在新会话调用"></a>
## Load the skill in a new session

Start a new host session and confirm discovery:

| Host | Native entry |
| --- | --- |
| Codex | `$codex-task-harness` |
| Claude Code | `/codex-task-harness` |
| DeepSeek Harness | Ask DSH to load `codex-task-harness`; its conditional `/name` gesture is documented in HOSTS |

Codex UI metadata keeps implicit invocation enabled. Other hosts use their own discovery mechanisms. DSH needs enabled providers and a skill consumer; no Codex UI behavior is assumed. See [HOSTS](HOSTS.md).

<a id="日常提示词"></a>
### Daily prompts

New task:

```text
Use codex-task-harness for this task: …
Prepare the complete master, all major stages, shared protocols,
recovery and acceptance for my review. After I approve that complete
version, proceed by verified dependencies. Report actual changes,
validation evidence, compatibility and unresolved issues.
```

Existing task:

```text
Resume the task at [absolute path to the existing HARNESS.md].
Read master and recovery, then obtain context. Use current approval,
dependencies, active executions and latest acceptance. Preserve the
original runId; load historical evidence only for a specific gap.
```

Acceptance failure:

```text
Resolve the acceptance failure. Distinguish a substantive criterion
failure, an execution/dependency guard refusal and actual evidence drift.
Retain the failed attempt and arrange rework and revalidation. A refusal
alone does not invalidate an otherwise current verified result.
```

Interrupted execution:

```text
Recover through the original entry and establish whether the original
process actually ended. Preserve its step, runId, host, mode and facts.
Submit only after confirmed completion. Replay only complete identical
facts. Stale closure does not restore approval or acceptance eligibility.
```

<a id="cli-路线"></a>
## CLI workflow

```text
draft → complete contract → refs → substantive stages and recovery
→ prepare-review → present complete package → direct human approval
→ decision

Native work: context → begin → actual work and confirmed completion
→ returned inline submission → verify

Independent execution: context → run → inspect actual closure and receipt → verify
```

Use an absolute project. A draft is a scaffold, not an approved plan. Path checks and machine review do not establish semantic correctness. Successful `prepare-review --handoff-only` returns Markdown; normal output is JSON.

```powershell
node $cli draft --project 'ABSOLUTE_PROJECT' --id example-task --goal 'Describe the complete task' --domain software --layout layered --host claude-code --allow-host codex
```

New template 4 binds the selected default and explicit repeated `--allow-host` alternatives. Context, begin and run may select only reviewed allowed hosts. Old templates1–3 retain Codex semantics. Use the original begin's returned submission identity. Submit accepts `ok` or `failed`; it neither stops a process nor verifies a task. Review criteria need actual evidence keyed by criterion ID.

Independent `run` performs its own begin, process supervision and factual submission. Do not call begin before run or repeat a normal successful submission. It still requires separate acceptance through verify. Run uses `--host` and optional `--executable`; `--codex` remains its Codex-only alias. It can call a model and requires applicable authorization. Doctor creates temporary evidence. Neither is a default installation check. See [HOSTS](HOSTS.md) and the [runtime reference](../skills/codex-task-harness/references/runtime.md).

Non-English anchor IDs preserve existing fragment links.
