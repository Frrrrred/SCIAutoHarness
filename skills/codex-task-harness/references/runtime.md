# 本地运行接口

使用 `node <skill>/scripts/harness.mjs help`；正确引用当前 shell 路径，不使用 npx、npm install 或第二套编排。

本页命令用于实体机器包。无文件授权的完整会话包采用 authoring.md 的会话批准与恢复路线，不调用这些命令，也不声称生成了机器状态或摘要。下文 pending-review 交回要求用于准备新包；同一有效批准内的独立只读委派按 context-hygiene.md 继承并执行原任务。

## 新分层任务

新建机器包使用项目内普通工作目录 `harness/<task-id>/`；已有 `.codex/harness/<task-id>/` 包保持原位兼容，不自动迁移。相同 ID 两处同时存在时运行时拒绝选择，不用新包遮蔽旧批准或旧回执。workspace-write 对已有 .codex 的保护保持不变；旧包写入被拒绝时如实受阻，不提权或代写绕过。

1. `draft --project PATH --id ID --goal TEXT --domain research --layout layered`。读取 authoring.md，填完整 contract.json、contextFiles 和 recoveryFile。返回 authoring.refs（首建整包映射）、authoring.next（--next，部分编写）和 authoring.prepareReview（--repair-output-refs --handoff-only），含本机真实 command/args；不用复制函数或另写封装脚本。每项任务有独占 outputs、依赖及 acceptance，研究 protocol 说明实际适用性；旧格式省略 layout 保持原行为。
2. 首建任务填好完整契约后优先运行 `refs --project ABSOLUTE_PATH --id ID`，一次取得全部文档的规范引用，再写齐各份实质规划；契约与路径不变时复用映射，不必每写一份重取。可在一次原生调用内分别写多份独立文档，不能以空壳占位或与契约Update混成大补丁。部分包续接或映射变化才用authoring.next，即 `refs --project ABSOLUTE_PATH --id ID --next`，取得当前待写文件。inherits 给出总控与适用共享协议链接，采用这些引用继承全局规则；正文写本阶段的输入/前置、方法/假设、产物/归属、验收证据、失败处理与交接，先写全实质主要文件再作可选扩写，不固定字数/文件数或用非空代替验收。它只读区分缺失/空/存在，非空不代表语义已验收，不生成空壳。全部齐备后完成内容复核与修订，再封存；原refs整包或--document模式仍可用，--next不能与--document混用。文件齐备后优先运行draft返回的authoring.prepareReview，即 `prepare-review --project ABSOLUTE_PATH --id ID --repair-output-refs --handoff-only`，一次完成未审draft的限定产物链接修正→render同步总控→原路径检查→review；修正边界及逐项报告见authoring.md。不要等末尾再手算层级拼修正补丁。无flag的原入口保持，已有review缺返回用只读handoff，不重跑修正选项。两命令支持重复 `--allow-root AUTHORIZED_ABSOLUTE_ROOT`，必须已有真实授权。无效契约不会覆盖总控；路径失败返回非零、issues/uncovered 和 review=null，用 refs 修正后重跑，不能只改文件或跳过复检。成功只进入 pending_user_review，摘要绑定全部阶段和恢复文件，不证明语义/科学正确或用户身份。reviewFiles 可绑定其他必要受审附件；不可把状态/回执当计划。成功的--handoff-only直接输出完整待审Markdown，失败保持诊断和非零；默认JSON保留。成功文本确认总控/契约一致且总控已绑定当前审查摘要；已经实际取得成功文本后直接正常最终回复，不为重复确认同步而回读总控，只有具体新缺陷才回读/修订；不默认在封存后再次整包语义复核或反复handoff。此时交付任务 ID、revision、digest、总控及全部阶段/协议/恢复文件导航、真实检查结果和待最终用户审查状态；子代理正常回交供转呈，不向父代理请求代写或自批，不在待审状态执行正式工作。
3. 向用户展示完整包，获直接批准后保存 actor=user、decision=approve|reject|revise、taskId、revision、digest、message、source，用 `decision --record FILE` 记录。没有真实用户回复不能创建批准；调用者声明不等于身份认证。
4. 已给出任务入口时，首批项目读取只限总控/恢复说明；skill接口说明可读，随后立即 `context --project PATH --id ID --task STEP`。此顺序优先于一般输入调查，提示中指出的 SCOPE、README、任务说明等也在 context 后按需读取，不能并入首次读取。此前不枚举/宽搜或读完整state/前置报告，搜索命中行同样算载入；明确入口未知/缺失才在指定任务目录有限定位。接口只读返回当前阶段正文、适用协议、全程边界、当前验收、批准/依赖摘要和 blockers；不加载未来阶段正文、全部 contract 或历史事件。分层 review.approval 给出当前批准actor/decision/任务/修订/摘要及原文/来源各最多512字符摘录与截断标记，不含事件历史；无当前有效批准为null，仍须结合真实用户授权判断。无具体证据缺口不再读取旧账本确认一次。canBegin 只是已声明机制的检查，不取代真实授权。实际执行开始后 canBegin=false 用于防重复启动，不否定当前 runId 的已批准执行。
5. 原生宿主 `begin --task STEP` 返回 runId；分层任务还返回 submission 的当前运行命令/参数。先实际工作，再附 `--reference "真实工具或运行位置" --result ok|failed` 执行该内联提交，可附 `--summary`、`--outcome negative|opposite|inconclusive|positive|not-applicable`。字段必须来自真实执行，不能复制示例冒充证据。无需创建载荷 JSON；正式回执由运行时独占创建，退出0仍为 pending_acceptance。用 `help submit` 或 `submit --help` 查看专用说明与可执行参数示例。旧 `--receipt FILE` 仍接受独立载荷，不能与内联字段混用，也不能把载荷写到 receipt-<runId>.json/state.json 等保留位置；同目标或文件身份别名会被明确拒绝，不自动移动/删除。
6. `verify --task STEP [--reviews FILE]` 实际检查批准标准，当前证据完整才 verified。依赖需 verified；输出/回执/日志/验收报告变化使相关任务和下游陈旧。正常已声明输出和进度变化不更改方案批准；不可变输入/受审规范变化继续使批准失效。

contextFiles 路径是任务包内相对 Markdown；每项声明 path、kind=phase|reference、tasks、purpose、loadWhen。recoveryFile 指恢复/维护文档，整包绑定但仅恢复时加载。输入 inputs[].path 可绑定已授权的项目外真实文件/受控 manifest，不授予写权限；大数据清单摘要不等于逐文件核验。尚待生成或会按方案更新的工作结果声明为 outputs，不误当不可变初始输入。

编写期间使用 refs 的实际引用和 prepare-review 的组合入口；稳定完整契约首建先取整包映射复用，部分包用next定位，避免机械重复映射挤占内容复核与最终回交。修订旧review包优先采用refs --next返回的收尾action：它保留旧状态保护，不再推荐仅适合未审draft的repair-output-refs；递增revision、完成实质修订后不带该选项封存，不能删state或伪造draft来绕过守卫。缺文件先单独写入，保持既有路径，不因插入阶段重命名全套文件；契约更新和新文档分开，总控由renderer同步。成功结果的 handoffMarkdown 可直接用于正常最终回交，已含当前审查身份、完整导航及用户审查请求；详细阶段规划留在受审文件，无需重新展开。若有真实缺陷仍应修正并重新审查。仅生成 handoffMarkdown 或机器 review 成功不代表最终交付已完成。修改引用后仍须取得当前版本的实际复检及 review 结果，最后正常交付待审包；不把文件已修正视为校验通过。调用已经发出却被中断时，状态是“检查已启动、结果未取得”，不是未运行，也不是通过；保留调用与中断记录，恢复后补足结果。最终交付需真实成功的路径检查、当前 review 的 ID/revision/digest、全部导航及等待最终用户审查状态，不能由父代理的事后检查代替。

## 活动运行、写入边界与验收恢复

活动执行身份独立于输出证据状态。state.activeExecutions 及 context.activeExecutions 保留 step/runId/原审查摘要，context.executionBlockers 报告不能安全配对的遗留事件。上游漂移使任务 stale 或批准失效时，活动 run 不因此消失；begin 拒绝重复/冲突启动，review 与 prepare-review 也拒绝活动运行及待验收结果，不能用重审清空它们。

begin 与 verify 共用活动/歧义执行门禁。verify 先正常刷新状态，再在进入本次验收回执、产物或 review 检查及启动任一 criterion 前检查门禁；刷新仍会核验已 verified 任务的旧证据。独立 B 仍活动时，A 的验收请求被拒绝，错误代码 HARNESS_ACTIVE_EXECUTION 含原运行位置；artifact/review/command 一致处理。拒绝沿现有受锁变更路径追加 criterion=execution-guard 的失败记录，log/exitCode/processResult 为 null、checks/evidence 为空；这些运行时控制记录不表示本次验收已启动，也不保证 state 字节不变。原回执、历史、仍有效的旧验收证据与其他活动身份保留；A 原来有效的 verified 不因拒绝记录被撤销，真实漂移仍按规则派生 stale。获取锁失败时没有 attempt，也不释放其他持有者的锁。门禁不在锁内等待原运行结束，不放入提交、审批变更或通用 mutate；已 begin 原 run 的启动校验仍允许自身 active。

确认原运行真实结束后，仍以原 step/runId 和真实 reference/result 执行 submit。仅当前批准、运行和依赖均有效时才 acceptedForVerification=true，并按正常结果进入验收；失效或孤立运行的事实收尾返回 executionClosed=true、acceptedForVerification=false，结果保持 stale，不能恢复批准或验证旧产物。下文/上文“退出0仍待验收”指有资格验收的正常成功提交；事实收尾本身不代表验收资格。关闭旧 run 不覆盖不同 run 的当前任务。submit 不停止、取消或杀死进程，调用者必须先核实真实结束。

同 run 重放用于恢复完整回执已发布、state 指针尚未提交的窗口，不重新执行任务。回执先在同目录唯一临时文件写完、关闭，再排他 link 发布固定 final；不支持这种发布的平台明确失败，不用可覆盖 rename 降级。若 final 已完整存在，按原模式提供相同事实再次 submit：原内联提交复用原字段；原文件模式或含 process/logs 等额外事实的执行回执，使用保留全部原 caller 事实的独立输入载荷或直接 API 对象，正式 final 及其别名不能作为 sourceFile。无需为正常原生内联提交另建载荷。运行时随后核固定位置、task/step/run/原审查绑定、已存摘要及规范化 caller 事实（键顺序无关，额外 JSON 事实仍比较）。原 active 可事实闭合并重新判断当前批准/依赖；旧回执缺可靠批准绑定只作 stale 闭合。已 closed 的相同重放返回 replayed=true，不重写回执、不新增闭合事件、不把 verified 降级、不覆盖不同当前 run。已经 stale 闭合的旧结果不会因前置后来修复而重新取得资格。

reference/result/outcome/summary/process/logs 等事实冲突、错误身份/原审查、坏 JSON/部分 final 或已绑定 hash 不符均保留原件并拒绝；不能删 final、改 state、清 active 或重审绕过。临时清理失败会保留原错误、publication 状态与路径；完整 final 及其自身同 inode 临时残留仍可按同 run 恢复。提交不是进程取消，重放前也必须已有真实结束事实。

原运行摘要仅从同 runId 的显式 begin、同 runId 的旧 task 或带运行时来源标记的闭合事件恢复。旧 active 缓存不能建立批准绑定，避免历史错误派生值继续污染。未知原绑定保持 null；完整旧 final 的摘要仅记为 receiptReviewDigest 观测值，相同事实可 stale 闭合，不能从 caller/final 补造批准。已知原摘要与 final 的不同非空摘要仍拒绝；缺可靠绑定或发布时无验收资格的旧 final 不能晋升。闭合事件的可选 reviewBinding 来源字段是加法兼容，不要求迁移旧包。

schemaVersion 仍为1；旧 begin/receipt 事件按事件顺序恢复。没有 runId 的旧 receipt 仅在当时该 step 恰有一个候选时闭合；多候选保留阻塞，不能猜测或自动清锁。status/context 只读派生，正常变更命令持久化状态。

### 总控模板版本

contract.templateVersion 与 schemaVersion 分开：缺省或显式数值1使用冻结的v1完整模板；显式数值2保持原v2正文；新draft明确写入数值3，使用中性的产品说明。layered/legacy的v2与v3均使用准确状态摘要。缺省只作只读解释，不补字段、不重排契约、不改旧总控或批准；v1历史的“退出0/回执即待验收”简写仅描述有资格的正常成功首次提交，实际failed、stale及重放语义仍按上文处理。v2/v3明确这些分支，CLI帮助沿用同一准确摘要。

两个渲染入口与契约校验只接受数值1、2、3，严格拒绝其他版本或类型，不从正文猜版本，也不将旧/新正文任选其一接受。总控仍须与契约所选模板全文一致，并由原审查摘要绑定。status/context对已受审未知版本保留诊断和原active身份；新正式动作失去资格，原run真实结束后仍可按原事实stale闭合。通用读取不因模板未知而封死收尾路径。

未改动的v1/v2包可以沿原批准续接approved、pending_acceptance、verified或active run，不需重审。主动改templateVersion（包括给缺省旧包补写1）属于受审文件变更：先完成pending验收、事实闭合active，再递增revision、render、完整review并等待最终用户批准；不得自动迁移、继承旧批准或重绑旧verified。异常中途改动仍保留原身份，事实收尾不恢复资格。新v3包不保证由不支持该模板版本的旧运行时无缝读取；不得删字段或伪造总控恢复旧批准，继续使用支持该版本的运行时。

render 拒绝 HARNESS.md 符号链接，先校验任务范围再原子替换，硬链接不会原位改写外部目标。review/prepare-review 检查输出与包内控制、受审文档及已有回执/日志的物理文件身份；发现硬链接别名则拒绝。它们是当前文件系统上的边界检查，不是 OS 沙箱或并发恶意改链防护。

verify 失败也保存 acceptanceAttempts 和 lastAcceptance：包括标准、错误、实际日志/退出码（未取得则为 null）、报告、原回执及下一步；成功重试追加新记录并保留旧失败。这些记录的 status 描述该次调用的结果，不直接替代任务当前状态。context.acceptance 只返回最近摘要与证据指针，不展开历史/日志，须结合 context.currentStatus 判断；最近 acceptance.status=failed 与 currentStatus=verified 可以同时成立。

失败的验收尝试本身不建立新的 verified。对有资格验收的 pending_acceptance 任务，前置检查或实质验收失败不能按通过放行，须保留实际失败证据并按原因处理；命令非零、启动失败、日志创建失败均按实际事实记录。已 verified 任务的重复请求被 execution-guard 或前置条件拒绝，不因该条失败记录撤销仍有效的旧验收；当前状态仍由批准、依赖及刷新核验的既有证据决定。记录/报告写入自身若被文件系统拒绝，仍须报告实际错误，不能保证不可写磁盘上的持久化。恢复时按当前状态选择重验、返工或沿用仍有效的验证，见 recovery-maintenance.md。

execution-guard 拒绝的报告保存失败时，reportError 留在尝试记录，原异常的 recovery.acceptanceReportError 也保留该事实，使随后 state 保存或清锁再失败时仍可诊断；不可写磁盘上的记录不视为已持久化。正常报告、state 与锁分别按各自实际结果判断。

进程结果分别记录 processState=not-started/closed 与原始 exitCode/signal、pid、timedOut、outputBytes 和控制/日志错误。已经 spawn 的 child 出现 error、kill 返回 false、抛错或 EPERM 不能证明结束；runProcess 保持原观察直到实际 close，engine.run 不提前 submit 或释放 active。无法确认终态的异常标为 unknown-active 并保留原 run。timeout 的策略 code=124 与真实 exitCode/signal 分开；只终止本次直接子进程，不能据此推断孙进程终态。

日志 open/write/close、同步 spawn 清理均受控 settle，异常带 processResult；cleanup 失败不覆盖真实 close，也不产生未处理 rejection。实际已结束后日志 digest 失败仍作 failed 事实提交，不编造日志摘要。verify 的 lastAcceptance/报告保留原始退出事实及 processResult，context 最近摘要提供报告指针；失败的验收尝试本身不建立新的 verified，当前状态与重验要求按上文判断。没有 close 时持续观察原调用，不启动第二 writer 或后台观察器。

独立 run 在日志排他打开之后、spawn 之前构造实际提示并核对原 runId、可信审批摘要、当前批准、依赖及实际正文；layered/legacy 共用门禁。自身 active 时 canBegin=false 是正常防重复状态。prepareInput 为内部可选准备回调，无 CLI 绕过开关；运行时用现有写锁覆盖读取、末次检查和同步 spawn，再释放启动锁。遵守写锁的并发审批命令不能在检查中提交新状态；若因占锁而被拒绝，该审批命令未生效，调用者须据真实结果处理。启动锁在 spawn 之后释放失败时，仍观察实际 close，不能标成 not-started 或重启。此检查是观测点保证，不是文件系统原子沙箱。准备异常且未调用 spawn 记录 not-started；日志关闭错误同时保留。begin 保存或清锁异常也不得继续启动：只关联本次 candidate，确认盘上身份，不能改取最新运行。

准备/执行失败沿同一 submit 路径闭合。contract/state/锁或磁盘阻止提交时，错误保留原 runId/reviewDigest/processResult、稳定 submissionFacts 及独立 closureError；没有持久闭合就不报告 executionClosed。原 submission JSON 可用于同 run API 重放，不能把 closureError 加入事实。回执发布、state 补写及外层清锁多重失败均保留原错误、实际 publication 和保存错误；不可写磁盘不能保证持久记录。

永久回归入口：`node <skill>/scripts/tests/harness-regression.mjs --work-root <已授权绝对测试目录>`。仅在明确目录创建标为 SYNTHETIC 的独立夹具并保留结果，不使用真实任务批准、不安装依赖；链接测试若平台不可用须报告失败/未验证，不能算通过。

跨版本升级另运行`node <skill>/scripts/tests/template-upgrade-regression.mjs --baseline-source <兼容基线技能绝对路径> --baseline-manifest <基线摘要JSON绝对路径> --work-root <已授权全新测试目录>`。运行前须另行核实基线与固定金样provenance.sourceHashes一致；套件机器校验基线与所传currentSkillHashes（或等价平面摘要映射）的完整一致性，缺失/不符直接失败；不会从网络下载基线。该套件由真实旧运行时创建两种布局及缺省/显式v1包，再由当前运行时续接，包含真实子进程及故障恢复。可先加--prepare-only保存16个升级前检查点，再在正式运行传--prepared-index <该次prepared-index.json绝对路径>；同一检查点只使用一次，不能复用已被测试推进的包。固定v1渲染预期来自template-v1-golden.json。常规套件不要求外部基线；升级验收必须两套均实际通过，分别报告版本、计数及原始证据，不用历史通过记录代替本轮执行。

## 本地命令返回、续取与回交

使用宿主实际提供的命令工具，保留完整返回、退出状态和运行句柄。返回继续执行的句柄时续取同一调用，不因空输出重新启动。下方JavaScript示例仅适用于实际提供functions编排、tools.exec_command、tools.write_stdin及store/load的宿主；其他宿主使用其真实工具接口和句柄，不假定这些工具存在。示例中的命令和目录须替换为本次已授权的真实值：

```javascript
const result = await tools.exec_command({cmd: '<本次实际命令>', workdir: '<本次绝对任务目录>', yield_time_ms: 1000, max_output_tokens: 12000});
store('harnessCommand', result);
text(result);
```

若返回session_id，表示命令仍在运行，空output不是完成。functions.exec每次是新隔离环境；下一调用从store/load恢复该次完整返回，用真实句柄续取并累计输出，不重新运行原命令：

```javascript
const previous = load('harnessCommand');
if (previous?.session_id === undefined) throw new Error('No running command session to resume.');
const continued = await tools.write_stdin({session_id: previous.session_id, chars: '', yield_time_ms: 1000, max_output_tokens: 12000});
store('harnessCommand', continued);
text(continued);
```

持续保留新的session_id，直到取得明确终态/exit_code和实际输出。若functions本身返回Script running with cell ID，先用对应wait续接该编排单元。等待服从任务总预算和中断控制，不在一次调用中无限轮询。没有句柄且结果不完整时标记未确认，先查原调用是否终止，不盲重跑prepare-review；已有当前有效review时可用 `handoff --project ABSOLUTE_PATH --id ID` 只读核对并直接输出待审Markdown，明确漂移/缺失时才修复并重审。

正常最终回复保留handoffMarkdown中的链接目标字面值；E:/已是Windows绝对路径，不能改成/E:/。核对全部导航、当前ID/revision/digest和最终用户审查请求后正常回交。工具返回退出0、状态文件或文本生成都不替代原生实际接收与最终回交。

## 验收与局限

- artifact：当前声明输出须为普通文件；组织目录按必要成员文件声明，或声明真实归档。摘要只绑定文件/归档字节；归档成员、可执行性和内容正确性另设实际 command/review 验收。路径与包成员示例按需见 [产物文件与归档示例](artifact-examples.md)。
- command：明确 executable 与字符串 args，无 shell 展开；实际保存日志与退出码，可给 timeoutMs 和 failureAction。副作用仍须符合用户授权；关键检查脚本可绑定为受审输入/附件。
- review：criterion ID 对应 verdict=pass、reviewer、source、rationale、files（项目内真实证据）、independence（实际独立性）。这是审查记录，不能自动鉴定语义/科学效度。科研每任务有 review 证据，机械阶段可聚焦其来源/质量，避免假装独立人员审查。

status 重新派生当前证据状态、返回 persisted=false，不修改状态；不要只读旧 state.json 宣称当前 verified。恢复/遗留执行与语义维护见 recovery-maintenance.md。契约/附件/绑定输入实质变更需增 revision、render、review、重新批准；旧证据留存不重绑。

独立 run 仅在额外模型已获授权时使用本机 Codex，默认 workspace-write/on-request、stdin EOF、真实日志；新布局使用同一阶段选择器，旧布局保持原提示结构。它不指定持久模型，不自动下载工具、切换执行器或启用额外模型。超时仅按资源或 --timeout-ms 指定；只终止直接子进程，不保证脱离的孙进程结束。运行时不代替 OS 隔离、网络/安装政策或身份认证。

写锁只在成功获取后尝试一次正常释放。action失败且释放成功时抛原错误；action成功且释放成功时返回原结果。释放失败抛 LOCK_CLEANUP_FAILED，保留 lockPath、actionStatus、cleanupError，以及 actionError 或 completedResult。actionStatus=failed 不表示没有部分写入；completed 表示回调已完成。CLI仍非零退出，但显示原操作事实、两个错误及恢复位置。不能据非零退出自动重跑或清锁；任意结果含循环对象时仍保留原 API 对象。

## 安装与回退

init 只生成项目安装预览。全局用 install-preview --codex-home <实际CODEX_HOME> --skill-root <用户.agents/skills> --out FILE。审查精确变更后 install --plan FILE；不同 skill 需显式 --replace-skill，新未知文件仍拒绝。AGENTS.override.md 遮蔽时先审查，不偷偷改它。

旧安装可能含不同托管块或当前分发清单外的旧参考文件；--replace-skill不会绕过这些安全拒绝。先明确目标并人工审查处理，再生成新预览，不自动覆盖旧块、删除多余文件或迁移安装。这不影响未修改旧任务包按其原模板和批准续接。

preview 在摘要/解码前拒绝符号链接、非普通文件、多硬链接或缺可靠身份的写入目标，内容相同也不豁免链接检查。计划增加 safetyVersion=1 与 beforeIdentity；apply 在写锁内重新 preview，既有文件 r+ 打开后 fstat 和路径/摘要复核，再通过原句柄写入和精确 truncate；新目标 wx 排他创建。新 skill 文件的源 mode 纳入计划并用于创建（仍受平台/umask），既有文件不主动改变 inode、mode、owner/ACL 或 NTFS 命名流；正常写入时间戳会变化。这是边界复核，不能防御所有恶意并发改链。

个人 AGENTS 支持无损 UTF-8、可选 BOM、CRLF、非 ASCII 和无末尾换行，原有字节作为 Buffer 保留；无法无损解码的编码在 preview 拒绝。缺托管块时按预览追加；已有块必须与目标路径生成器相符，差异或标记不唯一则要求审查，不自动覆盖个人规则。安装不改 config.toml/模型。

安装备份及 prepared 清单先于目标写入。中途 open/write/truncate/备份/manifest 失败会停止后续写，报告当前阶段的逻辑处理目标和恢复位置，不承诺单/多文件事务原子性或自动破坏性回退。安装的 recovery.failedTarget 在 write-targets 阶段为对应 change.target，即使异常来自 change.source 读取；备份阶段可能为正在读取的原文件或正在写入的备份，清单阶段为清单路径。它不保证等于底层异常的 I/O 源路径。备份/清单准备本身失败时清单可能尚不存在，应保留错误及 backup 目录现场。

rollback --manifest FILE 仅接受完成安装且带 safetyVersion/原后身份的清单，全体目标和备份先预检，按规范路径和物理身份排除重复；安装后同字节换 inode、链接化、内容/备份漂移或越界均拒绝，并在每次恢复/删除前复核。既有文件按同一已核验句柄策略恢复，本次新建文件才删除；仅移除变空的安装目录、保留备份。旧 plan 需重新 preview，旧无安全字段的 manifest 要人工审查，不能自动补字段或迁移旧任务包。

rollback 错误的 recovery.stage 区分 preflight、restore、cleanup-directories、manifest。recovery.failedTarget 为当前阶段正在处理的逻辑目标，不保证等于底层异常的 I/O 路径：preflight 和 restore 为对应清单项的 change.target，备份读取或校验失败时也保持这一含义；cleanup-directories 为当前目录；manifest 为清单路径。回退的实际备份源结合原始 cause（若包含路径）、清单对应项的 backup 和 backupDirectory 定位；安装读取源按对应项的 source 定位。不保证任意 cause 都带源路径。这些字段解释适用于实际返回的 recovery；清单初次读取/解析、入口安全校验或获取锁等包装之外的失败不保证具有 recovery。

completedTargets 只计完整返回成功的目标恢复/删除操作，totalTargets 为清单中的目标操作总数。failedTarget 不能证明目标已变化，成功计数也不能证明失败目标未变化；失败目标可能已经部分或全部变化。进入 cleanup-directories 表示全部目标文件操作已返回，此阶段失败尚未尝试更新清单；ENOTEMPTY 保留目录、ENOENT 继续，其他错误停止后续目录及清单。manifest 阶段失败表示提交未确认，应核实际清单，不一概断言磁盘仍为 installed。成功 API 结构不变；全部回调完成后清锁失败仍以 completedResult 表达实际成功，不降格为内部恢复失败。
