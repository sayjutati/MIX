# MIX Studio

歌ってみた制作用のブラウザ完結スタジオ群。本番: [mix-rosy.vercel.app](https://mix-rosy.vercel.app/)

| URL | アプリ |
|-----|--------|
| `/` | **TOP** — DAW / 動画編集を選ぶ（新しいタブで開く） |
| `/daw/` | MIX DAW — 録音・ミックス |
| `/video/` | MIX Video Studio — 動画編集 |

## デプロイ（Vercel）

リポジトリルートで `vercel.json` により一括ビルド:

```bash
npm run build
```

`dist/` に landing + daw + video が出力されます。

**重要:** Vercel プロジェクトの Root Directory はリポジトリ直下（`mix`）にしてください。以前 `daw-studio` のみを Root にしていた場合は、ルートに変更するか新規デプロイしてください。

## ローカル開発

```bash
# TOP ページのみ（静的）
npm run dev
# → http://localhost:3000

# 各アプリ（従来どおりルートパス）
cd daw-studio && npm install && npm run dev    # :1420
cd video-studio && npm install && npm run dev  # :1430
```

サブパス付きでまとめて試す場合:

```bash
npm run build
npx serve dist -l 3000
# TOP http://localhost:3000/
# DAW  http://localhost:3000/daw/
# Video http://localhost:3000/video/
```

## 典型フロー

1. **DAW** でボーカル＋BGM をミックス → `.daw` を保存
2. **Video** で動画を読み込み → DAW ミックスを重ねる → MP4 書き出し

詳細は `daw-studio/README.md` / `video-studio/README.md` を参照。
