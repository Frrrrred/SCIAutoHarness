# Agent Task Harness

<a id="codex-task-harness"></a>

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [Español](README.es.md)

**Codex、Claude Code、公式 DeepSeek Harness で、複雑なタスクのために完全でレビュー可能な Harness を自動作成します。**

スキルが読み込まれ、現在の複雑なタスクに適用されると、ホストが全体計画文書、主要な全段階、共通規約、復旧手順、成果物、依存関係、受け入れ基準を作成します。ユーザーが計画全体を直接承認してから正式作業を開始します。簡単な質問、限定的な診断、低リスクの単独編集は直接処理できます。実質的な計画と実作業はホストが担当し、Node.js ランタイムは契約、依存関係、実行識別子と証拠を管理します。draft はひな形と作成操作を提供するだけで、完全な実質的計画の独立生成や承認は行いません。ファイル作成の許可がない場合は、会話内で完全な計画を提示します。

## 主な機能

| 主な機能 | Harness |
| --- | --- |
| 完全な Harness の自動作成 | 複雑な依頼から全体計画、段階、規約、復旧、検証を含む完全な計画を作成し、最終ユーザーに提示 |
| 全体計画とユーザーレビュー | 全段階が同一のレビュー対象版に属し、承認は実際の内容に結び付く |
| 段階的な読み込み | 全体計画と復旧から再開し、現在段階と必要な依存概要のみを読み込む |
| 依存関係に基づく進行 | タスク DAG と成果物の担当を明示し、検証済み依存関係に従う |
| 実行と検証の分離 | begin は識別子を確立、submit は終了事実を記録、verify は受け入れを検証 |
| 証拠の有効性 | 入力変更は承認に影響し、出力と証拠の変更は関連結果と下流を stale にする |
| 元の実行の復旧 | 活動中の run ID を保持し、古い実行の事実記録と完全一致するレシートの再送を許可 |
| 共通実行ガード | 活動中または不明な実行は競合開始と検証を阻止し、診断を保持 |
| 複数の検証方式 | artifact、command、review により失敗、ログ、プロセス事実を保持 |
| インストールのプレビューと復元 | 正確な差分を確認し、既存指示のバイト列と識別子を保護、危険な変化を拒否 |
| 3種類の明示的ホスト | 同一スキルとエンジンでネイティブ作業と別途承認された run を提供 |
| 研究証拠の管理 | 出典、フィールド対応、パラメータ、依存結果の利用判断、否定的結果を追跡 |

## インストール、呼び出し、ロールバック

完全なリポジトリクローンから実行します。中核は Node.js の組み込み機能と同梱モジュールを使用し、npm install は不要です。既存のホストを選び、実際の home とスキル親ディレクトリを指定します。インストーラーはクライアント、プロバイダー、権限を設定しません。以下は Codex の例です。他のホストは表の値に置き換えます。正確なプレビューをユーザーが承認した後に適用し、返された rollbackManifest を保持します。ロールバックの影響もレビューしてください。

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

この正確なプレビューをユーザーが確認して承認した後に実行します：

```powershell
node $cli install --plan $planFile
```

返された rollbackManifest を保持し、影響を確認してから復元します：

```powershell
node $cli rollback --manifest 'ABSOLUTE_RETURNED_MANIFEST'
```

| ホスト ID | home の例 | スキル親ディレクトリ | 指示ファイル |
| --- | --- | --- | --- |
| `codex` | `~/.codex` | `~/.agents/skills` | `AGENTS.md` |
| `claude-code` | `~/.claude` | `~/.claude/skills` | `CLAUDE.md` |
| `deepseek-harness` | `$DSH_HOME` or `~/.dsh` | `<home>/skills` | `AGENTS.md` |


## 実行、既存タスク、復旧

```text
ネイティブ：context → begin → 実作業と終了確認 → submit で事実記録 → verify
独立 CLI：context → run → 実際の終了記録とレシートを確認 → verify
```

独立 run は開始、プロセス監視、事実提出を自身で行います。先に begin を呼ばず、正常提出を繰り返さないでください。--host codex|claude-code|deepseek-harness と任意の --executable LOCAL_ENTRY を使用し、--codex は Codex 専用の互換引数です。run はモデルを呼ぶ可能性があり、実行とリソースの承認が必要です。最初の適格な ok 提出は pending_acceptance、failed は failed に移行します。資格を失った元実行は事実を閉じても stale のままです。現在の証拠だけが verified を確立し、終了コード0、ファイル、最終メッセージだけでは正しさを証明できません。

**新しいタスク**

```text
agent-task-harness を使い、次の複雑なタスクの完全な Harness を作成してください：… 全体計画、主要な全段階、規約、復旧、検証をレビューに提示し、私の直接承認後に検証済み依存関係で進めてください。
```

**既存タスク**

```text
[HARNESS.md の絶対パス]から再開してください。全体計画と復旧を読み、context を取得します。元の承認、step、runId、ホストとモードを保持し、具体的不足のためだけに過去証拠を読みます。
```

**検証失敗**

```text
基準の失敗、ガードによる拒否、証拠の変更を区別してください。失敗記録を保持して再作業と再検証を行います。拒否だけでは有効な verified 結果を無効にしません。
```

**異常復旧**

```text
元プロセスが実際に終了したか確認し、元識別子と実際の終了事実を保持してください。完全一致する事実だけを再送し、stale の終了記録で承認や検証資格を復活させないでください。
```

## 名前とインストールの互換性

正式名は agent-task-harness です。新セッションで検出を確認し、Codex は `$agent-task-harness`、Claude Code は `/agent-task-harness`、DSH は必要なファイルシステムプロバイダーとコンシューマーを有効にしてスキルを読み込みます。旧 `$codex-task-harness`、`/codex-task-harness` と文書化された旧 CLI パスは、通常ファイルの軽量エントリから同一エンジンへ転送します。別の状態や承認はありません。Codex の暗黙呼び出しは正式エントリのみで有効です。他のホストは独自の検出機構を使用します。

新プレビューは safety3 を使用し、正式ディレクトリ、互換ディレクトリ、固定指示ファイルを厳密に結び付けます。認識済みの旧完全インストールは --replace-skill --migrate-legacy を付けた新しいプレビューのレビューが必要です。未知ファイル、変更済み旧コード、混合／重複マーカー、独自ブロックの自動移行は拒否します。別途レビュー済みの独自ブロック変更は、正確な before/after API 入力でのみ行い、CLI は黙って上書きしません。

移行は旧原本を同一ボリューム上のスキル検出外の復旧ストレージへ、結び付け済みの番号付き .bin スロットで移します。旧空ディレクトリとメタデータは保持します。成功したロールバックは元のファイル識別子、ACL、NTFS ストリームを復元し、その後に元の safety1/2 マニフェストを再使用できます。旧マニフェストを書き換えず、旧プレビューは再生成します。移行自体をロールバックする前に旧マニフェストでロールバックしようとすると、ドリフトとして拒否されます。

失敗したインストール／復元は部分完了の可能性があります。マニフェスト、バックアップ、移存原本、原因、確認済み進捗を保持します。prepared 移行記録は確認済み操作を残しますが、新ファイル識別子の記録前の中断は手動レビューが必要です。自動ロールバックは完了したインストールのみを対象とします。同じ hash だけを根拠に削除したり、盲目的に再試行したり、ロックを消したりしないでください。

タスク schema1、テンプレート1–4のバイト列、レビュー済みホストポリシー、現在の `harness/<id>/` と旧 `.codex/harness/<id>/` 保存先、実行／レシート識別子は不変です。既存 approved、pending_acceptance、verified、active タスクは元の承認と終了事実の規則を保持します。

## 権限と検証の範囲

スキル読み込み、ホスト選択、承認記録は、ファイル、ツール、ネットワーク、インストール、モデル利用枠を追加しません。各ホストの権限制御は異なり、ランタイムは操作者認証、OS サンドボックス、科学的正しさの自動証明を提供しません。スケジュール、サービス、MCP、圧縮、完全なチームサービスはホストまたは外部の能力です。

[VALIDATION](docs/VALIDATION.md) に実際の件数と環境を示します。どのホストでも実モデル呼び出しは検証に含めず、バージョン／ヘルプ確認と合成プロセスは別証拠です。DSH 対象は公式コミット 687f282e8625c6b8d11ff58211a90524be2e4317（@deepseek-ai/dsh 0.2.1-rc.2）です。DSH はインストールも実機検証もしていません。ソースと厳密なフィクスチャだけでは、実際のスキル検出、プロバイダー連携、モデル実行を証明できません。

**元の84件のクロスランタイム更新回帰テストは実行していません。** 一致する外部固定ベースラインが利用できないためです。主要回帰、ゴールデン、現在基線からの継続、移行テストは代替しません。確立済みのローカル環境は Windows / Node v26.12.1 で、完全テストは Python、pwsh、リンク、ACL、NTFS ストリームも使用します。他 OS や最小 Node バージョンは保証しません。

## 出典とライセンス

[shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) s01–s17 の Harness 工学原則に基づいて開発しています。共有スキルとローカル証拠ランタイムを提供し、[対応表](docs/LEARN_CLAUDE_CODE.md) は設計参考、実装、ホスト能力を区別します。独立プロジェクトであり、OpenAI、Anthropic、DeepSeek、shareAI Lab の公式製品でも、完全な教程エージェントの直接フォークでもありません。必要な MIT 通知、出典、ゴールデンの由来を保持します。

[Getting started](docs/GETTING_STARTED.md) · [Host profiles](docs/HOSTS.md) · [Architecture](docs/ARCHITECTURE.md) · [Validation](docs/VALIDATION.md) · [Compatibility](docs/COMPATIBILITY.md) · [Attribution](ATTRIBUTION.md) · [MIT](LICENSE) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)
