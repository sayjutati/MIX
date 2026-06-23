# DTM Studio

Web 版 DTM（MIDI シーケンス制作）。MIX ポータル `/dtm/` 配下で配信。

## 開発

```bash
npm install
npm run dev    # http://localhost:1440
# ポータル経由: リポジトリルートで npm run build → http://localhost:3000/dtm/
```

## 実装済み（MVP）

- マルチトラック + ピアノロール（Canvas）
- ノート追加・移動・リサイズ・削除（Del）
- 複数選択（Shift+クリック）
- クオンタイズ（Grid 1/4〜1/32、Quantize ボタン）
- ベロシティ編集（選択ノート）
- ミキサー（Volume / Pan / Mute / Solo）
- 内蔵シンセ 3 種（トラックごとに切替）
- Transport（Play / Stop / BPM / Loop）
- IndexedDB 自動保存

## 次の実装ステップ

- ループ範囲の UI 編集
- シンセパラメータ UI（ADSR / Waveform）
- プロジェクト名・一覧・新規作成
- オフライン WAV 書き出し
