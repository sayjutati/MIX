import { QUANTIZE_OPTIONS } from "../../utils/quantize";
import type { QuantizeGrid } from "../../utils/quantize";

type Props = {
  quantizeGrid: QuantizeGrid;
  onQuantizeGridChange: (grid: QuantizeGrid) => void;
  selectedCount: number;
  velocity: number;
  onVelocityChange: (v: number) => void;
  onQuantize: () => void;
  onDelete: () => void;
};

export function PianoRollToolbar({
  quantizeGrid,
  onQuantizeGridChange,
  selectedCount,
  velocity,
  onVelocityChange,
  onQuantize,
  onDelete,
}: Props) {
  return (
    <div className="piano-roll__toolbar">
      <label className="piano-roll__tool tooltip" data-tooltip="ノート配置・移動時の目安となるグリッド幅">
        グリッド
        <select
          value={quantizeGrid}
          onChange={(e) => onQuantizeGridChange(Number(e.target.value) as QuantizeGrid)}
        >
          {QUANTIZE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {selectedCount > 0 && (
        <>
          <label className="piano-roll__tool tooltip" data-tooltip="選択ノートの強さ（1〜127）">
            ベロシティ {velocity}
            <input
              type="range"
              min={1}
              max={127}
              value={velocity}
              onChange={(e) => onVelocityChange(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            className="piano-roll__tool-btn tooltip"
            data-tooltip="選択ノートをグリッドに揃える"
            onClick={onQuantize}
          >
            クオンタイズ ({selectedCount})
          </button>
          <button
            type="button"
            className="piano-roll__tool-btn piano-roll__tool-btn--danger tooltip"
            data-tooltip="選択ノートを削除（Delete キーでも可）"
            onClick={onDelete}
          >
            削除
          </button>
        </>
      )}
      <span className="piano-roll__tool-hint">
        クリック=追加 · ドラッグ=移動 · 右端=長さ変更 · Shift+クリック=複数選択
      </span>
    </div>
  );
}
