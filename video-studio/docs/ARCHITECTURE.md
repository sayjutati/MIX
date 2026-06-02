# Video Studio — アーキテクチャ

## 目的

ブラウザ完結の非線形動画エディタ（NLE）。`daw-studio` と同じデザイン言語・タイムライン座標系を共有し、DAW のミックスダウン／`.daw` 音声をタイムラインへ取り込める。

## レイヤ

| 層 | 責務 |
|----|------|
| `types.ts` | プロジェクト・トラック・クリップ・エフェクト・トランジションの型 |
| `utils/timeline.ts` | 秒↔px、スナップ、クリップの実効長 |
| `history.ts` | スナップショット型 undo/redo |
| `project.ts` | `.vproj` JSON の保存／読み込み（メディアは base64 埋め込み） |
| `preview/compositor.ts` | 再生時刻でのレイヤ合成（video / image / text / フィルタ） |
| `export/exportVideo.ts` | Canvas + 音声を `MediaRecorder` で WebM 書き出し |
| `daw/import.ts` | WAV/MP3 と `.daw` からオーディオクリップ生成 |
| `hooks/useEditor.ts` | 編集操作の集約（分割・トリム・FX 等） |
| `components/*` | プレゼンテーション |

## 機能マトリクス（v1）

- マルチトラック（映像・音声・テキスト・オーバーレイ画像）
- インポート: 動画・音声・画像・DAW 書き出し
- タイムライン: ズーム・ルーラー・スナップ・プレイヘッド・ループ A–B
- クリップ: 移動・トリム・分割・複製・削除・速度・音量・不透明度
- トランジション: クロスフェード（隣接クリップ）
- テキスト: 内容・サイズ・色・位置
- 映像 FX: 明るさ・コントラスト・彩度・ぼかし・グレースケール・セピア
- キーフレーム: 不透明度（クリップ内 0–100% 線形）
- 書き出し: WebM（H.264 非対応環境は VP8/VP9）
- ショートカット・Undo/Redo・`.vproj` 保存

## 音声（v2）

| ソース | トラック | 説明 |
|--------|----------|------|
| 動画ファイル | Video + Audio（リンク） | 映像は Canvas、音は Audio トラックから再生 |
| DAW `.daw` | Audio 2（BGM/DAW） | daw-studio のミックス。動画内蔵音とは別 |
| 音声ファイル | Audio | `origin: media` |

プレビュー: `PlaybackEngine`（Web Audio + MediaElement）  
書き出し: `mixAudioOffline` → WebM

## 将来（v3+）

- ffmpeg.wasm による MP4/H.264
- マスク・クロマキー・PIP
- Tauri ネイティブエンコード
