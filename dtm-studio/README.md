# DTM Studio

Web 版 DTM（MIDI シーケンス制作）。MIX ポータル `/dtm/` 配下で配信。

## 開発

```bash
npm install
npm run dev    # http://localhost:1440
npm run test   # ユニットテスト
```

## 実装済み

- マルチトラック + Canvas ピアノロール（移動・リサイズ・削除・クオンタイズ・ベロシティ）
- ミキサー（Volume / Pan / Mute / Solo）
- 内蔵シンセ 3 種 + ADSR / Waveform パネル
- ループ範囲 UI（ルーラードラッグ + Transport 数値入力）
- Transport（Play / Stop / BPM / Space）
- **WAV / MP3 書き出し**（オフラインシンセ・ノーマライズ）
- **MIDI ファイル import / export**（SMF format 1）
- **プロジェクト一覧**（IndexedDB 複数プロジェクトの開く・削除）
- プロジェクト名・新規作成
- IndexedDB 自動保存・起動時復元
- ループ時 cycle ID による再スケジュール
