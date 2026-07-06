# MIX Photo Studio — Architecture

ブラウザ完結の画像生成・編集スタジオ。DTM / DAW / Video と同じ MIX ポータル配下（`/photo/`）で動作する。

## モジュール構成

```
photo-studio/
├── src/
│   ├── types/document.ts       # PhotoProject, Layer, GenerateParams
│   ├── history/history.ts      # スナップショット Undo/Redo（最大40）
│   ├── canvas/
│   │   ├── pixelOps.ts         # 明るさ・コントラスト・彩度
│   │   └── layerRenderer.ts    # レイヤー合成・書き出し
│   ├── generate/
│   │   └── generationService.ts # GenerationProvider 抽象 + localCanvasProvider
│   ├── storage/
│   │   ├── imageAssets.ts      # IndexedDB 画像 Blob
│   │   └── projectStorage.ts   # .pphoto JSON + importImageFile
│   ├── state/usePhotoStore.ts  # Zustand ストア
│   └── components/             # UI
└── docs/ARCHITECTURE.md
```

## データモデル

- **PhotoProject**: キャンバスサイズ、背景色、レイヤー配列
- **RasterLayer**: IndexedDB `assetId`、transform、adjustments、blendMode
- **.pphoto**: メタデータ JSON（画像本体は IndexedDB、projectId で紐付け）

## 生成パイプライン

```
GeneratePanel → usePhotoStore.generateImage()
  → GenerationProvider.generate()
  → saveImageAsset() → 新レイヤー追加
```

MVP は `localCanvasProvider`（API 不要・プロンプトハッシュで決定論的）。将来 OpenAI / Stability / Replicate を `GENERATION_PROVIDERS` に追加。

## レンダリング

```
CanvasViewport → renderProject(ctx, project, resolveAssetUrl)
  → 各レイヤー: loadImage → applyAdjustments → transform 描画
```

書き出しは同じ `renderProject` を offscreen canvas に適用し `canvasToBlob`。

## ポータル統合

| 項目 | 値 |
|------|-----|
| dev port | 1450 |
| base path | `/photo/` |
| dist | `dist/photo/` |

```bash
npm run dev:photo   # 単体開発
npm run build       # ポータル全体ビルド
```

## 今後の拡張

1. 外部 API プロバイダー（API キー設定 UI）
2. テキスト・シェイプレイヤー
3. ブラシ・マスク・クロップ
4. DAW / Video との連携（サムネ・背景素材の受け渡し）
