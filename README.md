# LLM Bilingual Translator

ショートカットキーでページ全体をバイリンガル翻訳するChrome拡張機能。LLMエンドポイント・モデル・プロンプトはユーザーが自由に設定できます。

## 機能

- **ショートカット翻訳**: `Ctrl+Shift+Y`（Mac: `Cmd+Shift+Y`）でページ全体を翻訳。もう一度押すと翻訳を解除
- **バイリンガル表示**: 各段落（p, h1-h6, li, blockquote, td など）の原文の直下に日本語訳を挿入
- **複数プロファイル**: エンドポイント・APIキー・モデル・プロンプトのセットを複数保存し、切替可能（`Ctrl+Shift+U` で切替）
- **OpenAI互換API**: OpenAI API やローカルLLM（Ollama等）に対応

## セットアップ

```bash
npm install
npm run build
```

`chrome://extensions` → デベロッパーモード → 「パックされていない拡張機能を読み込む」で `dist/` フォルダを選択。

初回は拡張機能のオプション画面でプロファイルを登録してください（例: エンドポイント `https://api.openai.com/v1`、モデル `gpt-4o-mini`、APIキー）。

## 設定項目

| 項目 | 説明 |
|---|---|
| プロファイル名 | 切替時に表示される名前 |
| エンドポイント | OpenAI互換のベースURL（`/chat/completions` は自動補完） |
| APIキー | 認証不要なローカルLLMは空欄可。`chrome.storage.sync` に保存 |
| モデル名 | 例: `gpt-4o-mini` |
| 翻訳プロンプト | `{TEXT}` が翻訳対象テキスト（JSON配列）に置換される。空欄ならデフォルトの日本語翻訳プロンプト |

## 開発

```bash
npm run dev       # Vite開発サーバー
npm run typecheck # TypeScript型チェック
npm run build     # 型チェック + ビルド（dist/ に出力）
```

## 技術スタック

- TypeScript / React 18 / Vite
- Chrome Extension Manifest V3
- ポップアップ・オプション画面はReact、コンテンツスクリプトとバックグラウンド（Service Worker）は型付きTSをViteでバンドル

## ショートカット

| キー | 動作 |
|---|---|
| `Ctrl+Shift+Y` | 翻訳の切替 |
| `Ctrl+Shift+U` | 次のプロファイルへ切替 |

ショートカットは `chrome://extensions/shortcuts` で変更可能。

## 推奨モデル: PLaMo 3 Translate 0.8B（Ollamaで簡単に動かす）

PFNが公開した日本語特化の翻訳特化LLM [PLaMo 3 Translate](https://huggingface.co/pfnet/plamo-3-translate-0.8b)（0.8B / 2B / 8B / 31B の4サイズ）のうち、最小の **0.8B** は約0.6GBと軽量ながら日英翻訳で既存の翻訳特化LLMを上回る性能とされており、ローカル実行と相性が良い本拡張機能の推奨モデルです。53言語対応で、Ollama・LM Studio・llama.cppのいずれでも動かせます。

### 1. Ollamaでモデルを取得（一番簡単）

```bash
ollama pull hf.co/pfnet/plamo-3-translate-0.8b-GGUF:Q4_K_M
```

これで `http://localhost:11434/v1` にOpenAI互換APIが立ち上がります（Ollama起動中であること）。

### 2. 拡張機能のプロファイル設定

| 項目 | 設定値 |
|---|---|
| エンドポイント | `http://localhost:11434/v1` |
| APIキー | 空欄（ローカルは認証不要） |
| モデル名 | `hf.co/pfnet/plamo-3-translate-0.8b-GGUF:Q4_K_M` |
| 翻訳モード | **PLaMo Translate**（重要：これを選ぶとPLaMo専用のプロンプト形式で1テキストずつ翻訳します） |
| 翻訳プロンプト | 空欄でOK（PLaMoモードでは無視されます） |

### LM Studio / llama.cpp を使う場合

- **LM Studio**: モデルをダウンロードしてサーバーを開始（`http://localhost:1234/v1`）。モデル名はLM Studioに表示される識別子を指定
- **llama.cpp**: `llama-server -hf pfnet/plamo-3-translate-0.8b-GGUF --port 8080 --jinja --no-prefill-assistant` で起動し、エンドポイント `http://localhost:8080/v1`

いずれも翻訳モードは「PLaMo Translate」を選択してください。

> [!NOTE]
> PLaMo 3 Translate のライセンスは [PLaMoコミュニティライセンス](https://plamo.preferredai.jp/)（非商用は無料、商用は収益10億円未満なら事前登録で無料）です。
> 「汎用LLM」モード（JSON配列バッチ）は、OpenAI APIなど汎用チャットモデル向けです。PLaMoは翻訳特化モデルのためJSON形式の指示に従わず、必ずPLaMoモードを使ってください。
