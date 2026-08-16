import type { CSSProperties } from "react";
import type { Track } from "../../types/project";
import type { ToolMode } from "../../state/useEditorStore";
import { QUANTIZE_OPTIONS } from "../../utils/quantize";
import type { QuantizeGrid } from "../../utils/quantize";

type Props = {
  tracks: Track[];
  editTrackId: string | null;
  overlayTrackIds: Set<string>;
  onToggleOverlay: (trackId: string) => void;
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
  quantizeGrid: QuantizeGrid;
  onQuantizeGridChange: (grid: QuantizeGrid) => void;
  snapEnabled: boolean;
  onSnapChange: (on: boolean) => void;
  beatZoom: number;
  onBeatZoomChange: (z: number) => void;
  pitchZoom: number;
  onPitchZoomChange: (z: number) => void;
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
  onScaleTiming: (factor: number) => void;
};

export function PianoRollToolbar({
  tracks,
  editTrackId,
  overlayTrackIds,
  onToggleOverlay,
  toolMode,
  onToolModeChange,
  quantizeGrid,
  onQuantizeGridChange,
  snapEnabled,
  onSnapChange,
  beatZoom,
  onBeatZoomChange,
  pitchZoom,
  onPitchZoomChange,
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
  onScaleTiming,
}: Props) {
  return (
    <div className="piano-roll__toolbar">
      <div className="piano-roll__tool-group piano-roll__tools">
        <button
          type="button"
          className={`piano-roll__tool-btn piano-roll__tool-btn--mode${toolMode === "select" ? " is-active" : ""}`}
          data-tooltip="選択ツール（1）— ドラッグで範囲選択"
          onClick={() => onToolModeChange("select")}
        >
          選択
        </button>
        <button
          type="button"
          className={`piano-roll__tool-btn piano-roll__tool-btn--mode${toolMode === "draw" ? " is-active" : ""}`}
          data-tooltip="描画ツール（2）— ドラッグで長さ指定。Ctrl+ドラッグで連続配置"
          onClick={() => onToolModeChange("draw")}
        >
          描画
        </button>
      </div>
      <div className="piano-roll__tool-group">
        <button type="button" className="piano-roll__tool-btn tooltip" data-tooltip="元に戻す（Ctrl+Z）" disabled={!canUndo} onClick={onUndo}>
          ↩
        </button>
        <button type="button" className="piano-roll__tool-btn tooltip" data-tooltip="やり直し（Ctrl+Y）" disabled={!canRedo} onClick={onRedo}>
          ↪
        </button>
      </div>
      <div className="piano-roll__overlay-picks tooltip" data-tooltip="他トラックを薄く重ね表示（MIDIのみ）">
        <span className="piano-roll__overlay-label">重ね</span>
        {tracks.map((t, i) => {
          const num = i + 1;
          const isEdit = t.id === editTrackId;
          const isOn = overlayTrackIds.has(t.id);
          if ((t.kind ?? "midi") === "audio") return null;
          return (
            <button
              key={t.id}
              type="button"
              className={`piano-roll__overlay-pill${isOn ? " is-on" : ""}${isEdit ? " is-edit" : ""}`}
              style={{ "--pill-color": t.color } as CSSProperties}
              onClick={() => onToggleOverlay(t.id)}
            >
              {num}
            </button>
          );
        })}
      </div>
      <label className="piano-roll__tool tooltip" data-tooltip="グリッド幅">
        クオンタイズ
        <select value={quantizeGrid} onChange={(e) => onQuantizeGridChange(Number(e.target.value) as QuantizeGrid)}>
          {QUANTIZE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className="piano-roll__tool piano-roll__tool--check tooltip" data-tooltip="OFF = 自由配置">
        <input type="checkbox" checked={snapEnabled} onChange={(e) => onSnapChange(e.target.checked)} />
        スナップ
      </label>
      <label className="piano-roll__tool piano-roll__tool--check tooltip" data-tooltip="鍵盤で再生位置に打ち込み">
        <input type="checkbox" checked={stepRecord} onChange={(e) => onStepRecordChange(e.target.checked)} />
        打ち込み
      </label>
      <div className="piano-roll__tool-group">
        <span className="piano-roll__zoom-caption">横</span>
        <button type="button" className="piano-roll__tool-btn" onClick={() => onBeatZoomChange(beatZoom - 0.15)}>−</button>
        <span className="piano-roll__zoom-label">{Math.round(beatZoom * 100)}%</span>
        <button type="button" className="piano-roll__tool-btn" onClick={() => onBeatZoomChange(beatZoom + 0.15)}>+</button>
      </div>
      <div className="piano-roll__tool-group">
        <span className="piano-roll__zoom-caption">縦</span>
        <button type="button" className="piano-roll__tool-btn" onClick={() => onPitchZoomChange(pitchZoom - 0.1)}>−</button>
        <span className="piano-roll__zoom-label">{Math.round(pitchZoom * 100)}%</span>
        <button type="button" className="piano-roll__tool-btn" onClick={() => onPitchZoomChange(pitchZoom + 0.1)}>+</button>
      </div>
      <div className="piano-roll__edit-bar">
        <button type="button" className="piano-roll__tool-btn" onClick={onSelectAll}>全選択</button>
        <span className="piano-roll__zoom-caption">長さ</span>
        <button type="button" className="piano-roll__tool-btn" disabled={selectedCount === 0} data-tooltip="選択メロディを半分の長さに" onClick={() => onScaleTiming(0.5)}>½</button>
        <button type="button" className="piano-roll__tool-btn" disabled={selectedCount === 0} data-tooltip="少し縮める" onClick={() => onScaleTiming(0.75)}>¾</button>
        <button type="button" className="piano-roll__tool-btn" disabled={selectedCount === 0} data-tooltip="少し伸ばす" onClick={() => onScaleTiming(1.25)}>+25%</button>
        <button type="button" className="piano-roll__tool-btn" disabled={selectedCount === 0} data-tooltip="選択メロディを2倍の長さに" onClick={() => onScaleTiming(2)}>×2</button>
        <button type="button" className="piano-roll__tool-btn" disabled={selectedCount === 0} onClick={onCopy}>コピー</button>
        <button type="button" className="piano-roll__tool-btn" onClick={onPaste}>貼付</button>
        <button type="button" className="piano-roll__tool-btn" disabled={selectedCount === 0} onClick={onDuplicate}>複製</button>
        <button type="button" className="piano-roll__tool-btn" disabled={selectedCount === 0} onClick={() => onTranspose(1)}>↑</button>
        <button type="button" className="piano-roll__tool-btn" disabled={selectedCount === 0} onClick={() => onTranspose(-1)}>↓</button>
        <button type="button" className="piano-roll__tool-btn" disabled={selectedCount === 0} onClick={onQuantize}>揃える</button>
        <button type="button" className="piano-roll__tool-btn piano-roll__tool-btn--danger" disabled={selectedCount === 0} onClick={onDelete}>削除</button>
        <label className="piano-roll__tool piano-roll__tool--vel" data-tooltip="選択ノートのベロシティ">
          Vel
          <input type="range" min={1} max={127} value={velocity} disabled={selectedCount === 0} onChange={(e) => onVelocityChange(Number(e.target.value))} />
          <span>{selectedCount > 0 ? velocity : "—"}</span>
        </label>
      </div>
    </div>
  );
}
