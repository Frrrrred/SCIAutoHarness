# 普通文件与真实归档：生产、验收与消费

在需要合并代码/数据交付或解决父目录与成员重叠时读取。当前 schemaVersion 1 的输出是普通文件；目录只用于组织。保持实际成果，选择逐项声明必要成员或交付真实归档。README、索引、manifest只代表自身。

以下为明确标记 SYNTHETIC 的可执行工程例子，固定输入 `raw.json=[1,2,3]`、配置 `factor=2`，应产生三行清理数据及 `summary.json={"sum":12}`。这些数值仅验证任务运行时，不代表真实科研观察。例子的测试批准是隔离状态机输入，不是用户真实授权。

## 成员文件方案

| task | dependsOn | outputs 中的ID → deliverables.path | 实质验收 |
|---|---|---|---|
| code | 无 | prepare-code → code/prepare.mjs；analysis-code → code/analyze.mjs；analysis-config → config/analysis.json | 实际模块/配置内容与约定一致，入口能载入 |
| data | code | clean-data → data/clean.csv | 使用已验收代码和配置，实际生成并核对完整行值 |
| analysis | code、data | analysis-result → results/summary.json | 使用已验收程序和数据，实际核对 sum=12 |

code先生产程序和配置并verified，再由data首次消费；analysis消费已verified的code/data。code/、config/、data/和results/不作为deliverable。每个必要文件都有唯一生产者。

## 真实归档方案

同样声明data、analysis任务。code任务改为输出 code-bundle → packages/code.zip；归档内必须有 code/prepare.mjs、code/analyze.mjs 和 config/analysis.json。归档在data运行前生产并verified，不能只归给后期分析或最终打包。

归档验收检查唯一且完整的成员集合、成员实际字节和模块入口；data/analysis在消费前核对取得的成员来自已验收归档。例子读取固定成员并写入隔离目录，不使用不受控extractall。整个归档存在或hash一致不能单独证明内容正确。

若最终还要求代码、数据和结果的合并归档，可由后续打包任务消费已验收成果再生成；该最终包不替代早期成果的生产与验收。

## 实际运行与验收路线

永久回归入口负责为两个例子在指定测试根创建完整契约和阶段文件，实际调用 refs、prepare-review，执行begin→真实程序/数据生成→submit→verify，并检查最终结果及成员/归档变化后的下游stale：

```text
node <skill>/scripts/tests/harness-regression.mjs --work-root <已授权的全新绝对测试目录> --case-prefix artifact-
```

运行前将占位符替换为实际路径并按shell引用。这会写独立SYNTHETIC夹具、执行本地Node程序并使用现有Python标准库zipfile；不联网、不调用模型、不安装依赖。实现为 [永久回归](../scripts/tests/harness-regression.mjs) 和 [隔离产物助手](../scripts/tests/helpers/artifact-example.mjs)，实际契约/阶段/日志保留在返回的fixtureRoot。

两个正例必须真实通过；缺少可执行成员的真实ZIP必须验收失败并阻断data。已存在目录在review拒绝；把尚不存在的文件计划实际生成成目录，也无法取得验收资格。真实项目按其全部必需成果补齐ID、生产责任、首次消费和实质验收，不能仅复制这套示例文件名或数值。
