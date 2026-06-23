import { useCallback, useEffect, useRef } from "react";
import type { MidiNote, Track } from "../../types/project";
import { snapBeat } from "../../utils/quantize";

const ROW_H = 16;
const BEAT_W = 48;
const PITCH_MIN = 36;
const PITCH_MAX = 84;
const PITCH_COUNT = PITCH_MAX - PITCH_MIN + 1;
const RESIZE_HANDLE = 8;
const MIN_DURATION = 0.125;

type DragMode = "move" | "resize" | null;

type Props = {
  track: Track;
  playheadBeat: number;
  loopStart: number;
  loopEnd: number;
  beatsVisible: number;
  quantizeGrid: number;
  selectedNoteIds: Set<string>;
  onAddNote: (pitch: number, start: number) => void;
  onSelectNotes: (ids: string[]) => void;
  onToggleNote: (id: string) => void;
  onUpdateNotes: (updates: Array<{ noteId: string; patch: Partial<MidiNote> }>) => void;
};

export function PianoRollCanvas({
  track,
  playheadBeat,
  loopStart,
  loopEnd,
  beatsVisible,
  quantizeGrid,
  selectedNoteIds,
  onAddNote,
  onSelectNotes,
  onToggleNote,
  onUpdateNotes,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    noteId: string;
    startX: number;
    startY: number;
    origins: Map<string, { start: number; pitch: number; duration: number }>;
  } | null>(null);

  const width = beatsVisible * BEAT_W;
  const height = PITCH_COUNT * ROW_H;

  const noteRect = (note: MidiNote) => {
    const row = PITCH_MAX - note.pitch;
    return {
      x: note.start * BEAT_W + 1,
      y: row * ROW_H + 1,
      w: Math.max(BEAT_W * note.duration - 2, 4),
      h: ROW_H - 2,
    };
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#0e0e14";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(108, 140, 255, 0.06)";
    ctx.fillRect(loopStart * BEAT_W, 0, (loopEnd - loopStart) * BEAT_W, height);

    const gridStep = quantizeGrid * BEAT_W;
    for (let x = 0; x <= width; x += gridStep) {
      const beat = x / BEAT_W;
      ctx.strokeStyle = beat % 4 === 0 ? "#2a2a38" : "#1a1a24";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
      ctx.stroke();
    }
    for (let p = 0; p <= PITCH_COUNT; p++) {
      const y = p * ROW_H;
      const pitch = PITCH_MAX - p;
      ctx.strokeStyle = pitch % 12 === 0 ? "#252530" : "#16161e";
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
      ctx.stroke();
    }

    for (const note of track.notes) {
      const selected = selectedNoteIds.has(note.id);
      const r = noteRect(note);
      const vel = note.velocity / 127;
      ctx.fillStyle = selected
        ? "#8af0c0"
        : `rgba(108, 200, 255, ${0.35 + vel * 0.55})`;
      ctx.strokeStyle = selected ? "#fff" : "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      roundRect(ctx, r.x, r.y, r.w, r.h, 3);
      ctx.fill();
      ctx.stroke();
      if (selected) {
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillRect(r.x + r.w - RESIZE_HANDLE, r.y, RESIZE_HANDLE, r.h);
      }
    }

    const phx = playheadBeat * BEAT_W;
    ctx.strokeStyle = "#ff6b6b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(phx, 0);
    ctx.lineTo(phx, height);
    ctx.stroke();
  }, [track.notes, playheadBeat, loopStart, loopEnd, width, height, selectedNoteIds, quantizeGrid]);

  useEffect(() => {
    draw();
  }, [draw]);

  const clientToBeatPitch = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scroll = scrollRef.current;
    const x = clientX - rect.left + (scroll?.scrollLeft ?? 0);
    const y = clientY - rect.top + (scroll?.scrollTop ?? 0);
    const beat = x / BEAT_W;
    const pitchRow = Math.floor(y / ROW_H);
    const pitch = PITCH_MAX - pitchRow;
    return { beat, pitch, x, y };
  };

  const hitNote = (pitch: number, x: number, y: number) => {
    for (let i = track.notes.length - 1; i >= 0; i--) {
      const n = track.notes[i];
      if (n.pitch !== pitch) continue;
      const r = noteRect(n);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        const resize = x >= r.x + r.w - RESIZE_HANDLE;
        return { note: n, resize };
      }
    }
    return null;
  };

  const collectOrigins = (primaryId: string) => {
    const ids =
      selectedNoteIds.has(primaryId) && selectedNoteIds.size > 0
        ? selectedNoteIds
        : new Set([primaryId]);
    const origins = new Map<string, { start: number; pitch: number; duration: number }>();
    for (const n of track.notes) {
      if (ids.has(n.id)) origins.set(n.id, { start: n.start, pitch: n.pitch, duration: n.duration });
    }
    return { ids: [...ids], origins };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const { beat, pitch, x, y } = clientToBeatPitch(e.clientX, e.clientY);
    if (pitch < PITCH_MIN || pitch > PITCH_MAX) return;

    const hit = hitNote(pitch, x, y);
    if (hit) {
      if (e.shiftKey) {
        onToggleNote(hit.note.id);
        return;
      }
      if (!selectedNoteIds.has(hit.note.id)) {
        onSelectNotes([hit.note.id]);
      }
      const { origins } = collectOrigins(hit.note.id);
      dragRef.current = {
        mode: hit.resize ? "resize" : "move",
        noteId: hit.note.id,
        startX: x,
        startY: y,
        origins,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    onSelectNotes([]);
    const snapped = Math.max(0, snapBeat(beat, quantizeGrid));
    onAddNote(pitch, snapped);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { x, y } = clientToBeatPitch(e.clientX, e.clientY);
    const dx = (x - drag.startX) / BEAT_W;
    const dy = Math.round((drag.startY - y) / ROW_H);

    if (drag.mode === "move") {
      const primary = drag.origins.get(drag.noteId)!;
      const newStart = Math.max(0, snapBeat(primary.start + dx, quantizeGrid));
      const newPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, primary.pitch + dy));
      const dBeat = newStart - primary.start;
      const dPitch = newPitch - primary.pitch;
      const updates = [...drag.origins.entries()].map(([id, o]) => ({
        noteId: id,
        patch: {
          start: Math.max(0, snapBeat(o.start + dBeat, quantizeGrid)),
          pitch: Math.max(PITCH_MIN, Math.min(PITCH_MAX, o.pitch + dPitch)),
        },
      }));
      onUpdateNotes(updates);
    } else {
      const origin = drag.origins.get(drag.noteId)!;
      const newDur = Math.max(MIN_DURATION, snapBeat(origin.duration + dx, quantizeGrid));
      onUpdateNotes([{ noteId: drag.noteId, patch: { duration: newDur } }]);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current) {
      dragRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div className="piano-roll__keys">
      <div className="piano-roll__pitch-labels">
        {Array.from({ length: PITCH_COUNT }, (_, i) => {
          const pitch = PITCH_MAX - i;
          const isC = pitch % 12 === 0;
          return (
            <div
              key={pitch}
              className={`piano-roll__pitch-label${isC ? " piano-roll__pitch-label--c" : ""}`}
              style={{ height: ROW_H }}
            >
              {isC ? `C${Math.floor(pitch / 12) - 1}` : ""}
            </div>
          );
        })}
      </div>
      <div className="piano-roll__scroll" ref={scrollRef}>
        <canvas
          ref={canvasRef}
          className="piano-roll__canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export { BEAT_W, ROW_H };
