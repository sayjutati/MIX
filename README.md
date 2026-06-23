# MIX Studio

歌ってみた制作用のブラウザ完結スタジオ群。本番: [mix-rosy.vercel.app](https://mix-rosy.vercel.app/)

| URL | アプリ |
|-----|--------|
| `/` | **TOP** — DTM / DAW / 動画編集を選ぶ（新しいタブで開く） |
| `/dtm/` | MIX DTM — MIDI 作曲・シーケンス |
| `/daw/` | MIX DAW — 録音・ミックス |
| `/video/` | MIX Video Studio — 動画編集 |

## デプロイ（Vercel）

リポジトリルートで `vercel.json` により一括ビルド:

```bash
npm run verify   # 依存・Git の汚れを先に検知（push 前に推奨）
npm run build    # 内部でも verify を実行してから dist を生成
```

`dist/` に landing + dtm + daw + video が出力されます。

**重要:** Vercel プロジェクトの Root Directory はリポジトリ直下（`mix`）にしてください。

### デプロイ事故を防ぐルール

| やること | 理由 |
|----------|------|
| `node_modules` / `dist` を **絶対に Git に入れない** | Windows の `.bin` が Linux（Vercel）で `Permission denied` になる |
| 新しい `import` を足したら **そのアプリの `package.json` に依存を追加** | ローカルでは親フォルダの `node_modules` で動いても CI/Vercel では落ちる |
| push 前に `npm run verify` または GitHub **CI が緑** | Vercel と同じ Ubuntu で本番ビルドを先に実行 |
| 各アプリの **`package-lock.json` をコミット** | `npm ci` で本番と同じ依存ツリーを再現 |

CI: `.github/workflows/ci.yml`（`main` の push / PR）

## ローカル開発

### ルーティング（本番 = Vercel = `npm run build` 後の `dist/`）

| URL | 実体 |
|-----|------|
| `/` | `landing/` |
| `/dtm/` | `dtm-studio/dist/` をビルドして配置 |
| `/daw/` | `daw-studio/dist/` をビルドして配置 |
| `/video/` | `video-studio/dist/` をビルドして配置 |

**`npm run dev` だけでは `/dtm/` は存在しません。** TOP（landing）のリンクはビルド済みポータル向けです。

### おすすめ

```bash
# ポータル全体（TOP + /dtm/ + /daw/ + /video/）— 初回は自動 build
npm run dev
# → http://localhost:3000/dtm/ など全部使える

# 各アプリ単体（ホットリロード・開発向け）
npm run dev:dtm    # http://localhost:1440
npm run dev:daw    # http://localhost:1420
npm run dev:video  # http://localhost:1430

# TOP ページだけ編集（/dtm/ は 404 のまま）
npm run dev:landing
```

手動でまとめて試す場合:

```bash
npm run build
npx serve dist -l 3000
```

## 典型フロー

1. **DTM** で BGM・伴奏を作る（任意）
2. **DAW** でボーカル＋BGM をミックス → `.daw` を保存
3. **Video** で動画を読み込み → DAW ミックスを重ねる → MP4 書き出し

詳細は `dtm-studio/README.md` / `daw-studio/README.md` / `video-studio/README.md` を参照。
