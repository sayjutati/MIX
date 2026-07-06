import { FlipHorizontal, FlipVertical } from "lucide-react";
import { useRangeGesture } from "../hooks/useRangeGesture";
import { useSelectedLayer, usePhotoStore } from "../state/usePhotoStore";

export const AdjustPanel = () => {
  const layer = useSelectedLayer();
  const updateAdjustments = usePhotoStore((s) => s.updateAdjustments);
  const updateLayer = usePhotoStore((s) => s.updateLayer);

  const opacityGesture = useRangeGesture((v) => layer && updateLayer(layer.id, { opacity: v }));
  const brightnessGesture = useRangeGesture((v) => layer && updateAdjustments(layer.id, { brightness: v }));
  const contrastGesture = useRangeGesture((v) => layer && updateAdjustments(layer.id, { contrast: v }));
  const saturationGesture = useRangeGesture((v) => layer && updateAdjustments(layer.id, { saturation: v }));
  const blurGesture = useRangeGesture((v) => layer && updateAdjustments(layer.id, { blur: v }));
  const hueGesture = useRangeGesture((v) => layer && updateAdjustments(layer.id, { hue: v }));
  const scaleGesture = useRangeGesture((v) =>
    layer && updateLayer(layer.id, { transform: { ...layer.transform, scale: v / 100 } })
  );
  const rotationGesture = useRangeGesture((v) =>
    layer && updateLayer(layer.id, { transform: { ...layer.transform, rotation: v } })
  );

  if (!layer) {
    return (
      <div className="panel">
        <h2 className="panel__title">調整</h2>
        <p className="panel__empty">レイヤーを選択するか、キャンバスをクリックしてください</p>
      </div>
    );
  }

  if (layer.locked) {
    return (
      <div className="panel">
        <h2 className="panel__title">{layer.name}</h2>
        <p className="panel__empty">ロック中です。レイヤーパネルで解除できます</p>
      </div>
    );
  }

  const adj = layer.adjustments;
  const t = layer.transform;

  return (
    <div className="panel">
      <h2 className="panel__title">{layer.name}</h2>
      <p className="panel__hint">キャンバス上でドラッグして移動できます</p>

      <div className="panel__row">
        <label className="field field--half">
          X {Math.round(t.x)}
          <input
            type="number"
            value={Math.round(t.x)}
            onChange={(e) =>
              updateLayer(layer.id, { transform: { ...t, x: Number(e.target.value) } })
            }
          />
        </label>
        <label className="field field--half">
          Y {Math.round(t.y)}
          <input
            type="number"
            value={Math.round(t.y)}
            onChange={(e) =>
              updateLayer(layer.id, { transform: { ...t, y: Number(e.target.value) } })
            }
          />
        </label>
      </div>

      <div className="panel__flip">
        <button
          type="button"
          className={`btn btn--sm ${t.flipX ? "btn--active" : ""}`}
          onClick={() => updateLayer(layer.id, { transform: { ...t, flipX: !t.flipX } })}
        >
          <FlipHorizontal size={14} /> 左右反転
        </button>
        <button
          type="button"
          className={`btn btn--sm ${t.flipY ? "btn--active" : ""}`}
          onClick={() => updateLayer(layer.id, { transform: { ...t, flipY: !t.flipY } })}
        >
          <FlipVertical size={14} /> 上下反転
        </button>
      </div>

      <label className="field">
        不透明度 {layer.opacity}%
        <input type="range" min={0} max={100} value={layer.opacity} {...opacityGesture} />
      </label>

      <label className="field">
        明るさ {adj.brightness}%
        <input type="range" min={50} max={150} value={adj.brightness} {...brightnessGesture} />
      </label>

      <label className="field">
        コントラスト {adj.contrast}%
        <input type="range" min={50} max={150} value={adj.contrast} {...contrastGesture} />
      </label>

      <label className="field">
        彩度 {adj.saturation}%
        <input type="range" min={0} max={200} value={adj.saturation} {...saturationGesture} />
      </label>

      <label className="field">
        色相 {adj.hue}°
        <input type="range" min={-180} max={180} value={adj.hue} {...hueGesture} />
      </label>

      <label className="field">
        ぼかし {adj.blur}px
        <input type="range" min={0} max={20} value={adj.blur} {...blurGesture} />
      </label>

      <label className="field">
        スケール {Math.round(t.scale * 100)}%
        <input type="range" min={10} max={300} value={t.scale * 100} {...scaleGesture} />
      </label>

      <label className="field">
        回転 {t.rotation}°
        <input type="range" min={-180} max={180} value={t.rotation} {...rotationGesture} />
      </label>

      <label className="field">
        合成モード
        <select
          value={layer.blendMode}
          onChange={(e) =>
            updateLayer(layer.id, { blendMode: e.target.value as typeof layer.blendMode })
          }
        >
          <option value="normal">通常</option>
          <option value="multiply">乗算</option>
          <option value="screen">スクリーン</option>
          <option value="overlay">オーバーレイ</option>
        </select>
      </label>
    </div>
  );
};
