import type { CSSProperties } from "react";
import type { Track } from "../../types/project";
import { QUANTIZE_OPTIONS } from "../../utils/quantize";
import type { QuantizeGrid } from "../../utils/quantize";

type Props = {
  tracks: Track[];
  editTrackId: string | null;
  overlayTrackIds: Set<string>;
  onToggleOverlay: (trackId: string) => void;
  quantizeGrid: QuantizeGrid;
  onQuantizeGridChange: (grid: QuantizeGrid) => void;
  snapEnabled: boolean;
  onSnapChange: (on: boolean) => void;
  beatZoom: number;
  onBeatZoomChange: (z: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  selectedCount: number;
  velocity: number;
  stepRecord: boolean;
  onStepRecordChange: (on: boolean) => void;
  onVelocityChange: (v: number) => void;
  onQuantize: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onTranspose: (semitones: number) => void;
  onSelectAll: () => void;
};

export function PianoRollToolbar({
  tracks,
  editTrackId,
  overlayTrackIds,
  onToggleOverlay,
  quantizeGrid,
  onQuantizeGridChange,
  snapEnabled,
  onSnapChange,
  beatZoom,
  onBeatZoomChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  selectedCount,
  velocity,
  stepRecord,
  onStepRecordChange,
  onVelocityChange,
  onQuantize,
  onDelete,
  onDuplicate,
  onCopy,
  onPaste,
  onTranspose,
  onSelectAll,
}: Props) {
  return (
    <div className="piano-roll__toolbar">
      <div className="piano-roll__tool-group">
        <button
          type="button"
          className="piano-roll__tool-btn tooltip"
          data-tooltip="元に戻す（Ctrl+Z）"
          disabled={!canUndo}
          onClick={onUndo}
        >
          ↩
        </button>
        <button
          type="button"
          className="piano-roll__tool-btn tooltip"
          data-tooltip="やり直し（Ctrl+Y）"
          disabled={!canRedo}
          onClick={onRedo}
        >
          ↪
        </button>
      </div>
      <div className="piano-roll__overlay-picks tooltip" data-tooltip="重ねて表示するトラック番号（編集トラックは常に前面）">
        <span className="piano-roll__overlay-label">重ね表示</span>
        {tracks.map((t, i) => {
          const num = i + 1;
          const isEdit = t.id === editTrackId;
          const isOn = overlayTrackIds.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              className={`piano-roll__overlay-pill${isOn ? " is-on" : ""}${isEdit ? " is-edit" : ""}`}
              style={{ "--pill-color": t.color } as CSSProperties}
              onClick={() => onToggleOverlay(t.id)}
              title={
                isEdit
                  ? `トラック ${num}（編集中・常に表示）`
                  : `トラック ${num} を重ね表示${isOn ? " OFF" : " ON"}`
              }
            >
              {num}
            </button>
          );
        })}
      </div>
      <label className="piano-roll__tool tooltip" data-tooltip="ノート配置・移動時の目安となるグリッド幅">
        クオンタイズ
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
      <label className="piano-roll__tool piano-roll__tool--check tooltip" data-tooltip="OFF で自由な位置に配置（FL Studio のスナップと同様）">
        <input type="checkbox" checked={snapEnabled} onChange={(e) => onSnapChange(e.target.checked)} />
        スナップ
      </label>
      <label className="piano-roll__tool piano-roll__tool--check tooltip" data-tooltip="ON: 鍵盤・PCキーで再生位置にノートを打ち込む">
        <input
          type="checkbox"
          checked={stepRecord}
          onChange={(e) => onStepRecordChange(e.target.checked)}
        />
        打ち込み
      </label>
      <div className="piano-roll__tool-group">
        <button
          type="button"
          className="piano-roll__tool-btn tooltip"
          data-tooltip="横ズーム縮小"
          onClick={() => onBeatZoomChange(beatZoom - 0.15)}
        >
          −
        </button>
        <span className="piano-roll__zoom-label">{Math.round(beatZoom * 100)}%</span>
        <button
          type="button"
          className="piano-roll__tool-btn tooltip"
          data-tooltip="横ズーム拡大"
          onClick={() => onBeatZoomChange(beatZoom + 0.15)}
        >
          +
        </button>
      </div>
      <button
        type="button"
        className="piano-roll__tool-btn tooltip"
        data-tooltip="全ノート選択（Ctrl+A）"
        onClick={onSelectAll}
      >
        全選択
      </button>
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
          <button type="button" className="piano-roll__tool-btn tooltip" data-tooltip="コピー（Ctrl+C）" onClick={onCopy}>
            コピー
          </button>
          <button type="button" className="piano-roll__tool-btn tooltip" data-tooltip="貼り付け（Ctrl+V）" onClick={onPaste}>
            貼付
          </button>
          <button type="button" className="piano-roll__tool-btn tooltip" data-tooltip="複製（Ctrl+D）" onClick={onDuplicate}>
            複製
          </button>
          <button
            type="button"
            className="piano-roll__tool-btn tooltip"
            data-tooltip="半音上げ（Shift+↑）"
            onClick={() => onTranspose(1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="piano-roll__tool-btn tooltip"
            data-tooltip="半音下げ（Shift+↓）"
            onClick={() => onTranspose(-1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="piano-roll__tool-btn tooltip"
            data-tooltip="選択ノートをグリッドに揃える"
            onClick={onQuantize}
          >
            グリッドに揃える ({selectedCount})
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
        Ctrl+Z/Y · Ctrl+C/V/D · 矢印=移動 · M=メトロノーム
      </span>
    </div>
  );
}
