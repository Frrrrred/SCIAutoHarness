# Agent Task Harness

<a id="codex-task-harness"></a>

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [Español](README.es.md)

**在 Codex、Claude Code 或官方 DeepSeek Harness 中，为复杂任务自动编写完整、可审查的配套 Harness。**

技能已加载且适用于当前复杂任务时，宿主会编写总控文档、全部实质主要阶段、共享协议、恢复说明、交付物、依赖和验收标准。你先审查完整版本并直接批准，才开始正式执行。简单问答、窄范围诊断和低风险单点修改可以直接处理。宿主负责编写方案和使用工具；本地 Node.js 运行时管理契约、依赖、运行身份和证据。`draft` 只生成骨架和编写操作，不会独立生成完整实质方案或代替你批准。没有文件授权时，在会话内提交完整方案。

## 功能亮点

| 功能亮点 | Harness |
| --- | --- |
| 自动编写完整 Harness | 将复杂请求转为总控、阶段、协议、恢复和验收组成的完整方案，供最终用户审查 |
| 完整规划与用户审查 | 所有主要阶段属于同一个受审版本，批准绑定其真实内容 |
| 按需渐进加载 | 续接先读总控和恢复，再获取当前阶段及必要的依赖摘要 |
| 按依赖推进 | 任务 DAG 明确输出归属，下游须等待依赖通过验收 |
| 执行与验收分离 | begin 建立身份，submit 记录结束事实，verify 检查验收 |
| 证据有效性 | 输入变化影响批准，输出和证据变化使相关结果及下游失效 |
| 原运行恢复 | 保留活动 run ID，允许失效运行事实闭合及完整同事实回放，不重写历史 |
| 统一执行门禁 | 活动或含糊运行阻止冲突启动与验收，并保留诊断 |
| 多种验收方式 | artifact、command、review 保存失败、日志和进程事实 |
| 安装预览与回退 | 审查精确差异，保护原指令字节与身份，拒绝不安全漂移 |
| 三种明确宿主 | 同一技能和引擎支持原生流程及另经授权的独立 run |
| 科研证据规范 | 来源、字段映射、参数、依赖放行决定与负结果均可追溯 |

## 安装、调用与回退

从完整仓库克隆运行；核心只使用 Node.js 内置和随包模块，不需要 npm install。选择已经可用的宿主，使用自己的真实 home 和技能父目录。安装器不会安装客户端、配置提供器或授予权限。以下命令以 Codex 为例；其他宿主替换表中的三个值。先查看预览，用户批准精确预览后再应用，并保留实际返回的 rollbackManifest；回退效果也须经过审查。

```powershell
git clone https://github.com/Frrrrred/agent-task-harness.git
cd agent-task-harness
npm run check:skill
npm run help
```

```powershell
$cli = Join-Path (Get-Location).Path 'skills/agent-task-harness/scripts/harness.mjs'
$harnessHost = 'codex'
$harnessHome = Join-Path $HOME '.codex'
$skillParent = Join-Path $HOME '.agents/skills'
$planFile = Join-Path ([IO.Path]::GetTempPath()) ('agent-task-harness-' + [guid]::NewGuid() + '.json')
node $cli install-preview --host $harnessHost --host-home $harnessHome --skill-root $skillParent --out $planFile
Get-Content -LiteralPath $planFile -Raw
```

用户审查并批准本精确预览后，再执行：

```powershell
node $cli install --plan $planFile
```

保留返回的 rollbackManifest；审查回退效果后使用：

```powershell
node $cli rollback --manifest 'ABSOLUTE_RETURNED_MANIFEST'
```

| 宿主 ID | home 示例 | 技能父目录 | 指令文件 |
| --- | --- | --- | --- |
| `codex` | `~/.codex` | `~/.agents/skills` | `AGENTS.md` |
| `claude-code` | `~/.claude` | `~/.claude/skills` | `CLAUDE.md` |
| `deepseek-harness` | `$DSH_HOME` or `~/.dsh` | `<home>/skills` | `AGENTS.md` |


## 执行、旧任务与恢复

```text
宿主原生：context → begin → 实际工作并确认结束 → submit 真实事实 → verify
独立 CLI：context → run → 核对实际闭合与回执 → verify
```

独立 run 自行 begin、监督进程和提交事实。不要先 begin，也不要重复正常提交。使用 --host codex|claude-code|deepseek-harness 和可选 --executable LOCAL_ENTRY；--codex 保持 Codex 专用别名。run 可能调用模型，须具备相应执行与资源授权。首次具备资格的 ok 提交进入 pending_acceptance，failed 进入 failed；失去资格的原运行可闭合但仍 stale。只有当前有效证据才建立 verified，退出零、文件或最终消息不能单独证明正确性。

**新任务**

```text
使用 agent-task-harness 为以下复杂任务编写完整配套 Harness：…… 将总控、全部实质阶段、协议、恢复和验收交我审查。待我直接批准后，按已验收依赖连续执行。
```

**旧包续接**

```text
从[HARNESS.md绝对路径]续接。先读总控和恢复，再获取 context。保留原批准、step、runId、宿主和模式；只为具体缺口加载历史证据。
```

**验收失败**

```text
区分标准失败、门禁拒绝和证据漂移。保留失败尝试，安排返工和复验。门禁拒绝本身不使仍有效的 verified 结果失效。
```

**异常恢复**

```text
确认原进程是否实际结束，保留原身份，仅提交真实结束事实。只回放完整相同事实；stale 闭合不恢复批准或验收资格。
```

## 名称和安装兼容

正式名称是 agent-task-harness。新会话明确确认技能已发现：Codex 使用 `$agent-task-harness`，Claude Code 使用 `/agent-task-harness`，DSH 请求加载该技能并启用相应文件系统提供器和消费者。旧 `$codex-task-harness`、`/codex-task-harness` 和文档中的旧 CLI 路径通过普通文件轻量入口转发到同一引擎，不另建状态或批准。只有正式 Codex 入口允许隐式调用；其他宿主按自身机制发现。

新预览使用 safety3，严格绑定正式目录、兼容目录和固定指令角色。认可的旧完整安装须重新生成并审查带 --replace-skill --migrate-legacy 的预览。未知文件、旧代码修改、混合或重复标记、自定义块会拒绝自动迁移。单独受审的自定义块只能通过显式 before/after API 精确变更，CLI 不静默覆盖。

迁移将旧原件同卷移入技能发现目录之外、编号 .bin 槽位的受绑定恢复存储，保留旧空目录及元数据。成功回退恢复原文件身份、ACL 和 NTFS 命名流，之后才能再用原 safety1/2 清单。旧清单不改写，旧预览须重新生成；先回退旧清单会因漂移拒绝。安装或回退失败可能已部分写入，须保留清单、备份、移存原件、原始错误及已确认进度。prepared 迁移清单记录已确认操作；新文件身份尚未写入日志的中断窗口需人工审查。只有 completed 安装可自动回退。不要凭相同 hash 删除文件、盲目重试或清除锁。

任务 schema1、模板1–4字节、受审宿主策略、`harness/<id>/` 与旧 `.codex/harness/<id>/` 路径以及运行/回执身份不变。旧 approved、pending_acceptance、verified 和 active 任务保持原批准和事实闭合规则。

## 权限、验证和使用边界

加载技能、选择宿主或记录批准不会增加文件、工具、网络、安装或模型额度。三宿主权限机制不同，运行时不提供操作者认证、操作系统沙箱或科学正确性的自动证明。调度、服务、MCP、压缩和完整团队服务仍属于宿主或外部能力。

[VALIDATION](docs/VALIDATION.md) 记录实际测试数和环境。验证不包含任何宿主的真实模型调用；版本/帮助探测与合成进程是不同证据。DSH 兼容范围固定到官方提交 687f282e8625c6b8d11ff58211a90524be2e4317（@deepseek-ai/dsh 0.2.1-rc.2）；本次未安装或实机验证 DSH，源码和严格夹具不证明真实技能发现、提供器集成或模型执行通过。

**原84项跨运行时升级回归未执行**，所需匹配的外部冻结基线不可用。主回归、金样、当前基线续接和迁移测试不能替代它。已建立的本地基线是 Windows / Node v26.12.1；完整测试还使用 Python、pwsh、链接、ACL 和 NTFS 命名流，不能据此保证其他操作系统或最低 Node 版本。

## 来源与许可

基于 [shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) s01–s17 的 Harness 工程原则开发。这里提供共享技能和本地证据运行时；[课程映射](docs/LEARN_CLAUDE_CODE.md) 区分设计参考、实际能力与宿主能力。这是独立项目，不是 OpenAI、Anthropic、DeepSeek 或 shareAI Lab 官方产品，也不声称直接复刻完整教程代理。保留必要 MIT 通知、来源说明和金样来源摘要。

[Getting started](docs/GETTING_STARTED.md) · [Host profiles](docs/HOSTS.md) · [Architecture](docs/ARCHITECTURE.md) · [Validation](docs/VALIDATION.md) · [Compatibility](docs/COMPATIBILITY.md) · [Attribution](ATTRIBUTION.md) · [MIT](LICENSE) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)
