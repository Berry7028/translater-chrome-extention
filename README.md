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

## 推奨モデル: PLaMo 3 Translate 0.8B

PFNが公開した日本語特化の翻訳特化LLM [PLaMo 3 Translate](https://huggingface.co/pfnet/plamo-3-translate-0.8b)（0.8B / 2B / 8B / 31B の4サイズ）のうち、最小の **0.8B** は軽量ながら日英翻訳で既存の翻訳特化LLMを上回る性能とされており、ローカル実行と相性が良い本拡張機能の推奨モデルです。53言語に対応し、GGUF形式（llama.cpp）やMLX形式（Apple silicon）も提供されています。

### ローカルで立てる（llama.cpp の場合）

```bash
# GGUF版を直接ダウンロードしてOpenAI互換サーバーを起動
llama-server -hf pfnet/plamo-3-translate-0.8b --port 8080
```

### 拡張機能のプロファイル設定

| 項目 | 設定値 |
|---|---|
| エンドポイント | `http://localhost:8080/v1` |
| APIキー | 空欄（ローカルは認証不要） |
| モデル名 | サーバーの起動ログに表示されるモデル名（例: `plamo-3-translate-0.8b`） |
| 翻訳プロンプト | 空欄でOK（デフォルトの日本語翻訳プロンプトを使用） |

Ollama を使う場合は `ollama pull hf.co/pfnet/plamo-3-translate-0.8b-GGUF` で取得し、エンドポイントを `http://localhost:11434/v1` にしてください。

> [!NOTE]
> ローカルサーバーへ拡張機能からリクエストするため、llama.cppのサーバーは `--host 127.0.0.1` で起動し、CORS設定（`--api-key` なしの場合は `--no-webui` やブラウザのオリジン許可）が必要になる場合があります。PLaMo 3 Translate のライセンスは [PLaMoコミュニティライセンス](https://plamo.preferredai.jp/)（非商用は無料、商用は収益10億円未満なら事前登録で無料）です。
