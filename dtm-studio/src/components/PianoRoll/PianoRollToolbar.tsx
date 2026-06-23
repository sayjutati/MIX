import type { Instrument } from "../../types/project";
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
      <label className="piano-roll__tool">
        Grid
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
          <label className="piano-roll__tool">
            Vel {velocity}
            <input
              type="range"
              min={1}
              max={127}
              value={velocity}
              onChange={(e) => onVelocityChange(Number(e.target.value))}
            />
          </label>
          <button type="button" className="piano-roll__tool-btn" onClick={onQuantize}>
            Quantize ({selectedCount})
          </button>
          <button type="button" className="piano-roll__tool-btn piano-roll__tool-btn--danger" onClick={onDelete}>
            Delete
          </button>
        </>
      )}
      <span className="piano-roll__tool-hint">
        ドラッグ=移動 · 右端=リサイズ · Shift+クリック=複数選択 · Del=削除
      </span>
    </div>
  );
}

export type { Instrument };
