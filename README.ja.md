# SCIAutoHarness

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Español](README.es.md)

**Scientific Automation Harness** — 科学研究の計画、承認、実行、証拠の確認と再開を支えるハーネスです。

エージェントのホスト内で動作し、複雑な依頼を完全な計画に整理します。人による承認を計画に結び付け、確認済みの依存関係に沿って進め、再開時にも元の実行識別子を保持します。研究の結論は出典、パラメータと実行証拠に対応付けます。

## 始める

既存の Node.js 環境とエージェントホストを使用します。コアは Node.js の組み込みモジュールを使い、依存パッケージのインストールは不要です。

```powershell
git clone https://github.com/Frrrrred/SCIAutoHarness.git
cd SCIAutoHarness
npm run help
```

[導入と日常の使用](docs/GETTING_STARTED.md)に従い、対象をプレビューして承認後に適用します。新しい Codex セッションでは `$sciautoharness` を呼び出します。

## 作業の流れ

1. 成果物、出典、権限と受け入れ条件を定義します。
2. 実行前に完全な計画を人が確認します。
3. 証拠を確認した依存関係に沿って作業を進めます。
4. 元の入口から再開し、承認と実行識別子を保持します。

単純な質問や独立した低リスクの編集は直接処理できます。研究ではデータの出所、パラメータ選択、不確実性と下流利用前の確認も明記します。

```text
Use $sciautoharness to plan this research task: …
Use the existing research-sci environment. Define inputs, outputs,
permissions and acceptance. Wait for my review before execution.
```

## ホストと権限

Codex、Claude Code、DeepSeek Harness のホスト設定を提供します。検出、認証とモデル実行はホストの責任です。スキルの導入はホストの導入、プロバイダー設定や外部操作の承認を含みません。[ホスト](docs/HOSTS.md)と[互換性](docs/COMPATIBILITY.md)を参照してください。

## ドキュメント

- [導入と日常の使用](docs/GETTING_STARTED.md)
- [アーキテクチャ](docs/ARCHITECTURE.md)
- [ホスト](docs/HOSTS.md)と[互換性](docs/COMPATIBILITY.md)
- [貢献](CONTRIBUTING.md)と[セキュリティ](SECURITY.md)

## ライセンスと出典

[MIT ライセンス](LICENSE)で公開しています。[出典](ATTRIBUTION.md)に通知と設計上の参考をまとめています。
