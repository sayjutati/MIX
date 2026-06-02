# MIX Studio

歌ってみた制作用のブラウザ完結スタジオ群。

| アプリ | ディレクトリ | ポート | 役割 |
|--------|-------------|--------|------|
| **MIX DAW** | `daw-studio/` | 1420 | 録音・ミックス・`.daw` 保存 |
| **MIX Video** | `video-studio/` | 1430 | 動画編集・DAW音声の重ね合わせ・WebM 書き出し |

## 使い方（典型フロー）

1. `daw-studio` でボーカル＋BGM をミックス → `.daw` を保存
2. `video-studio` を起動 → 動画をインポート（映像＋元音声がリンク配置される）
3. 「DAW」で `.daw` を読み込み → **Audio 2** にミックス音声が載る
4. 編集・プレビュー（🔊 マスター／トラック M・S／クリップ 🔊）→ WebM 書き出し

## 起動

```bash
cd daw-studio && npm install && npm run dev
cd video-studio && npm install && npm run dev
```

詳細は各フォルダの `README.md` を参照。
