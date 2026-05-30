import { useMemo, useRef } from "react";
import { Loader2, RotateCcw, Check, RefreshCw } from "lucide-react";
import type { Clip, PitchNote } from "../types";
import { midiToName } from "../audio/pitch";

type Props = {
  clip: Clip;
  trackColor: string;
  /** 再生ヘッドのクリップ内ローカル秒（範囲外なら null） */
  playLocalTime: number | null;
  analyzing: boolean;
  applying: boolean;
  limit: number;
  onLimitChange: (limit: number) => void;
  onChangeNotes: (notes: PitchNote[]) => void;
  onApply: () => void;
  onReset: () => void;
  onReanalyze: () => void;
};

const PX_PER_SEC = 90;
const ROW_H = 15;
const LIMIT_OPTIONS = [1, 2, 3, 4, 5];

export function PitchEditor({
  clip,
  trackColor,
  playLocalTime,
  analyzing,
  applying,
  limit,
  onLimitChange,
  onChangeNotes,
  onApply,
  onReset,
  onReanalyze,
}: Props) {
  const notes = clip.notes ?? [];
  const dragRef = useRef<{ id: number; startY: number; baseShift: number } | null>(null);

  const { midiMin, midiMax } = useMemo(() => {
    if (notes.length === 0) return { midiMin: 48, midiMax: 72 };
    let lo = Infinity;
    let hi = -Infinity;
    for (const n of notes) {
      const center = n.midi + n.shift;
      lo = Math.min(lo, n.midi, center);
      hi = Math.max(hi, n.midi, center);
    }
    return {
      midiMin: Math.floor(lo) - (limit + 1),
      midiMax: Math.ceil(hi) + (limit + 1),
    };
  }, [notes, limit]);

  const rows = midiMax - midiMin;
  const graphHeight = rows * ROW_H;
  const graphWidth = Math.max(320, clip.duration * PX_PER_SEC + 24);

  const xOf = (t: number) => t * PX_PER_SEC;
  const yOf = (midi: number) => (midiMax - midi) * ROW_H;

  const hasShift = notes.some((n) => Math.round(n.shift) !== 0);

  const updateNote = (id: number, shift: number) => {
    onChangeNotes(notes.map((n) => (n.id === id ? { ...n, shift } : n)));
  };

  const handleDragStart = (e: React.PointerEvent, note: PitchNote) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { id: note.id, startY: e.clientY, baseShift: note.shift };

    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dy = ev.clientY - d.startY;
      const delta = Math.round(-dy / ROW_H);
      const next = Math.max(-limit, Math.min(limit, d.baseShift + delta));
      updateNote(d.id, next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleDoubleClick = (note: PitchNote) => updateNote(note.id, 0);

  return (
    <div className="pitch-editor">
      <div className="pitch-editor__toolbar">
        <div className="pitch-editor__limit">
          <span>補正の上限</span>
          <select
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            disabled={applying}
          >
            {LIMIT_OPTIONS.map((v) => (
              <option key={v} value={v}>
                ±{v} 半音
              </option>
            ))}
          </select>
        </div>
        <div className="pitch-editor__actions">
          <button
            className="pitch-editor__btn"
            onClick={onReanalyze}
            disabled={analyzing || applying}
            title="この録音を再解析してノートを引き直す"
          >
            <RefreshCw size={13} /> 再解析
          </button>
          <button
            className="pitch-editor__btn"
            onClick={onReset}
            disabled={applying || (!hasShift && !clip.originalUrl)}
            title="補正をすべて 0 に戻して原音を再生"
          >
            <RotateCcw size={13} /> リセット
          </button>
          <button
            className="pitch-editor__btn pitch-editor__btn--primary"
            onClick={onApply}
            disabled={applying || analyzing || notes.length === 0}
            title="編集したピッチを音に適用（高品質レンダリング）"
          >
            {applying ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
            {applying ? "適用中…" : "適用"}
          </button>
        </div>
      </div>

      <div className="pitch-editor__hint">
        各ノートを上下にドラッグして半音単位で調整（ダブルクリックで 0 に戻す）。上限・下限の範囲内なので声が破綻しません。
      </div>

      {analyzing ? (
        <div className="pitch-editor__status">
          <Loader2 size={16} className="spin" /> 音程を解析中…
        </div>
      ) : notes.length === 0 ? (
        <div className="pitch-editor__status">
          音程を検出できませんでした（無音・ノイズのみ等）。「再解析」を試してください。
        </div>
      ) : (
        <div className="pitch-editor__scroll">
          <div className="pitch-editor__axis" style={{ height: graphHeight }}>
            {Array.from({ length: rows }, (_, i) => {
              const midi = midiMax - i;
              const isC = ((midi % 12) + 12) % 12 === 0;
              return (
                <div
                  key={midi}
                  className={`pitch-editor__axis-row${isC ? " is-c" : ""}`}
                  style={{ height: ROW_H }}
                >
                  {(isC || ROW_H >= 14) && <span>{midiToName(midi)}</span>}
                </div>
              );
            })}
          </div>

          <div
            className="pitch-editor__graph"
            style={{ width: graphWidth, height: graphHeight }}
          >
            {Array.from({ length: rows }, (_, i) => {
              const midi = midiMax - i;
              const isC = ((midi % 12) + 12) % 12 === 0;
              return (
                <div
                  key={midi}
                  className={`pitch-editor__grid-row${isC ? " is-c" : ""}`}
                  style={{ top: yOf(midi), height: ROW_H }}
                />
              );
            })}

            {playLocalTime != null && (
              <div className="pitch-editor__play" style={{ left: xOf(playLocalTime) }} />
            )}

            {notes.map((note) => {
              const left = xOf(note.start);
              const width = Math.max(10, xOf(note.end) - xOf(note.start));
              const shift = Math.round(note.shift);
              return (
                <div key={note.id} className="pitch-editor__note-wrap">
                  {shift !== 0 && (
                    <div
                      className="pitch-editor__ghost"
                      style={{ left, width, top: yOf(note.midi) }}
                      aria-hidden
                    />
                  )}
                  <div
                    className={`pitch-editor__note${shift !== 0 ? " is-shifted" : ""}`}
                    style={{
                      left,
                      width,
                      top: yOf(note.midi + shift) - ROW_H / 2,
                      height: ROW_H,
                      background: trackColor,
                      touchAction: "none",
                    }}
                    onPointerDown={(e) => handleDragStart(e, note)}
                    onDoubleClick={() => handleDoubleClick(note)}
                    title={`${midiToName(note.midi)} → ${midiToName(note.midi + shift)}`}
                  >
                    {shift !== 0 && (
                      <span className="pitch-editor__note-label">
                        {shift > 0 ? `+${shift}` : shift}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
