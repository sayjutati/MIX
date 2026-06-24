import { useCallback, useEffect, useRef, useState } from "react";
import type { MidiNote, Track } from "../../types/project";
import { snapBeat } from "../../utils/quantize";
import { pitchJaRangeLabel } from "../../utils/pitchLabel";
import { BeatRuler } from "./BeatRuler";
import { PianoKeyboard } from "./PianoKeyboard";
import {
  BEAT_W,
  KEYBOARD_W,
  MIN_DURATION,
  PITCH_COUNT,
  PITCH_MAX,
  PITCH_MIN,
  RESIZE_HANDLE,
  ROW_H,
  isBlackKey,
} from "./pianoRollConstants";

type DragMode = "move" | "resize" | "draw" | null;

type Props = {
  editTrack: Track;
  overlayTracks: Track[];
  playing: boolean;
  playheadBeat: number;
  loopStart: number;
  loopEnd: number;
  loopEnabled: boolean;
  beatsVisible: number;
  quantizeGrid: number;
  selectedNoteIds: Set<string>;
  activePitches: Set<number>;
  drumMode?: boolean;
  onCreateNote: (pitch: number, start: number, duration: number) => string | null;
  onSelectNotes: (ids: string[]) => void;
  onToggleNote: (id: string) => void;
  onUpdateNotes: (updates: Array<{ noteId: string; patch: Partial<MidiNote> }>) => void;
  onLoopChange: (start: number, end: number) => void;
  onSeekBeat: (beat: number) => void;
  onPianoKeyDown: (pitch: number) => void;
  onPianoKeyUp: (pitch: number) => void;
};

export function PianoRollView({
  editTrack,
  overlayTracks,
  playing,
  playheadBeat,
  loopStart,
  loopEnd,
  loopEnabled,
  beatsVisible,
  quantizeGrid,
  selectedNoteIds,
  activePitches,
  drumMode = false,
  onCreateNote,
  onSelectNotes,
  onToggleNote,
  onUpdateNotes,
  onLoopChange,
  onSeekBeat,
  onPianoKeyDown,
  onPianoKeyUp,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const keysScrollRef = useRef<HTMLDivElement>(null);
  const rulerScrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const dragRef = useRef<{
    mode: DragMode;
    noteId: string;
    drawNoteId: string | null;
    startX: number;
    startY: number;
    drawPitch: number;
    drawStart: number;
    origins: Map<string, { start: number; pitch: number; duration: number }>;
  } | null>(null);
  const pendingDrag = useRef<Array<{ noteId: string; patch: Partial<MidiNote> }> | null>(null);
  const dragRaf = useRef(0);

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

  const clientToBeatPitch = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const beat = x / BEAT_W;
    const pitchRow = Math.floor(y / ROW_H);
    const pitch = PITCH_MAX - pitchRow;
    return { beat, pitch, x, y };
  };

  const hitNote = (x: number, y: number) => {
    for (let i = editTrack.notes.length - 1; i >= 0; i--) {
      const n = editTrack.notes[i];
      const r = noteRect(n);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        const resize = x >= r.x + r.w - RESIZE_HANDLE;
        return { note: n, resize };
      }
    }
    return null;
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

    for (let p = 0; p < PITCH_COUNT; p++) {
      const pitch = PITCH_MAX - p;
      const y = p * ROW_H;
      ctx.fillStyle = isBlackKey(pitch) ? "#12121a" : "#18181f";
      ctx.fillRect(0, y, width, ROW_H);
    }

    ctx.fillStyle = "rgba(52, 211, 153, 0.07)";
    ctx.fillRect(loopStart * BEAT_W, 0, (loopEnd - loopStart) * BEAT_W, height);
    if (loopEnabled) {
      ctx.strokeStyle = "rgba(52, 211, 153, 0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(loopStart * BEAT_W + 0.5, 0.5, (loopEnd - loopStart) * BEAT_W - 1, height - 1);
    }

    const gridStep = quantizeGrid * BEAT_W;
    for (let x = 0; x <= width; x += gridStep) {
      const beat = x / BEAT_W;
      ctx.strokeStyle = beat % 4 === 0 ? "#353545" : "#242430";
      ctx.lineWidth = beat % 4 === 0 ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
      ctx.stroke();
    }
    for (let p = 0; p <= PITCH_COUNT; p++) {
      const y = p * ROW_H;
      ctx.strokeStyle = "#1e1e28";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
      ctx.stroke();
    }

    for (const ot of overlayTracks) {
      for (const note of ot.notes) {
        const r = noteRect(note);
        const vel = note.velocity / 127;
        ctx.fillStyle = hexWithAlpha(ot.color, 0.22 + vel * 0.18);
        ctx.strokeStyle = hexWithAlpha(ot.color, 0.45);
        ctx.lineWidth = 1;
        roundRect(ctx, r.x, r.y, r.w, r.h, 3);
        ctx.fill();
        ctx.stroke();
      }
    }

    for (const note of editTrack.notes) {
      const selected = selectedNoteIds.has(note.id);
      const r = noteRect(note);
      const vel = note.velocity / 127;
      ctx.fillStyle = selected ? editTrack.color : hexWithAlpha(editTrack.color, 0.45 + vel * 0.45);
      ctx.strokeStyle = selected ? "#fff" : "rgba(255,255,255,0.2)";
      ctx.lineWidth = selected ? 1.5 : 1;
      roundRect(ctx, r.x, r.y, r.w, r.h, 3);
      ctx.fill();
      ctx.stroke();
      if (selected) {
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fillRect(r.x + r.w - RESIZE_HANDLE, r.y, RESIZE_HANDLE, r.h);
      }
    }
  }, [editTrack.notes, editTrack.color, overlayTracks, loopStart, loopEnd, loopEnabled, width, height, selectedNoteIds, quantizeGrid]);

  useEffect(() => {
    draw();
  }, [draw]);

  const flushDrag = (immediate = false) => {
    const run = () => {
      if (pendingDrag.current) {
        onUpdateNotes(pendingDrag.current);
        pendingDrag.current = null;
      }
      dragRaf.current = 0;
    };
    if (immediate) {
      if (dragRaf.current) cancelAnimationFrame(dragRaf.current);
      run();
    } else if (!dragRaf.current) {
      dragRaf.current = requestAnimationFrame(run);
    }
  };

  const scheduleDragUpdate = (updates: Array<{ noteId: string; patch: Partial<MidiNote> }>) => {
    pendingDrag.current = updates;
    flushDrag(false);
  };

  const collectOrigins = (primaryId: string) => {
    const ids =
      selectedNoteIds.has(primaryId) && selectedNoteIds.size > 0
        ? selectedNoteIds
        : new Set([primaryId]);
    const origins = new Map<string, { start: number; pitch: number; duration: number }>();
    for (const n of editTrack.notes) {
      if (ids.has(n.id)) origins.set(n.id, { start: n.start, pitch: n.pitch, duration: n.duration });
    }
    return { origins };
  };

  const drawDuration = (startBeat: number, currentBeat: number) => {
    const snapped = snapBeat(currentBeat, quantizeGrid);
    const end = Math.max(startBeat + quantizeGrid, snapped);
    return Math.max(quantizeGrid, end - startBeat);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const { beat, pitch, x, y } = clientToBeatPitch(e.clientX, e.clientY);
    if (pitch < PITCH_MIN || pitch > PITCH_MAX) return;

    const hit = hitNote(x, y);
    if (hit) {
      if (e.shiftKey) {
        onToggleNote(hit.note.id);
        return;
      }
      if (!selectedNoteIds.has(hit.note.id)) onSelectNotes([hit.note.id]);
      const { origins } = collectOrigins(hit.note.id);
      dragRef.current = {
        mode: hit.resize ? "resize" : "move",
        noteId: hit.note.id,
        drawNoteId: null,
        startX: x,
        startY: y,
        drawPitch: pitch,
        drawStart: 0,
        origins,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    onSelectNotes([]);
    const snapped = Math.max(0, snapBeat(beat, quantizeGrid));
    const id = onCreateNote(pitch, snapped, quantizeGrid);
    if (!id) return;
    onSelectNotes([id]);
    dragRef.current = {
      mode: "draw",
      noteId: "",
      drawNoteId: id,
      startX: x,
      startY: y,
      drawPitch: pitch,
      drawStart: snapped,
      origins: new Map(),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { x, y, beat } = clientToBeatPitch(e.clientX, e.clientY);

    if (drag.mode === "draw" && drag.drawNoteId) {
      const dur = drawDuration(drag.drawStart, beat);
      scheduleDragUpdate([{ noteId: drag.drawNoteId, patch: { duration: dur } }]);
      return;
    }

    const dx = (x - drag.startX) / BEAT_W;
    const dy = Math.round((drag.startY - y) / ROW_H);

    if (drag.mode === "move") {
      const primary = drag.origins.get(drag.noteId)!;
      const newStart = Math.max(0, snapBeat(primary.start + dx, quantizeGrid));
      const newPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, primary.pitch + dy));
      const dBeat = newStart - primary.start;
      const dPitch = newPitch - primary.pitch;
      scheduleDragUpdate(
        [...drag.origins.entries()].map(([id, o]) => ({
          noteId: id,
          patch: {
            start: Math.max(0, snapBeat(o.start + dBeat, quantizeGrid)),
            pitch: Math.max(PITCH_MIN, Math.min(PITCH_MAX, o.pitch + dPitch)),
          },
        }))
      );
    } else if (drag.mode === "resize") {
      const origin = drag.origins.get(drag.noteId)!;
      scheduleDragUpdate([
        { noteId: drag.noteId, patch: { duration: Math.max(MIN_DURATION, snapBeat(origin.duration + dx, quantizeGrid)) } },
      ]);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.mode === "draw" && drag.drawNoteId) {
      const { beat } = clientToBeatPitch(e.clientX, e.clientY);
      const dur = drawDuration(drag.drawStart, beat);
      scheduleDragUpdate([{ noteId: drag.drawNoteId, patch: { duration: dur } }]);
      flushDrag(true);
      onSelectNotes([drag.drawNoteId]);
    } else {
      flushDrag(true);
    }
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    draw();
  };

  const syncScrollX = useCallback((left: number) => {
    setScrollLeft(left);
    if (gridScrollRef.current && gridScrollRef.current.scrollLeft !== left) {
      gridScrollRef.current.scrollLeft = left;
    }
    if (rulerScrollRef.current && rulerScrollRef.current.scrollLeft !== left) {
      rulerScrollRef.current.scrollLeft = left;
    }
  }, []);

  useEffect(() => {
    if (!playing) return;
    const el = gridScrollRef.current;
    if (!el) return;
    const phx = playheadBeat * BEAT_W;
    const target = Math.max(0, phx - el.clientWidth / 2);
    if (Math.abs(el.scrollLeft - target) > 2) {
      syncScrollX(target);
    }
  }, [playing, playheadBeat, syncScrollX]);

  const onGridScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setScrollLeft(el.scrollLeft);
    if (keysScrollRef.current && keysScrollRef.current.scrollTop !== el.scrollTop) {
      keysScrollRef.current.scrollTop = el.scrollTop;
    }
    if (rulerScrollRef.current && rulerScrollRef.current.scrollLeft !== el.scrollLeft) {
      rulerScrollRef.current.scrollLeft = el.scrollLeft;
    }
  };

  return (
    <div className="roll-viewport">
      <div className="roll-viewport__corner" style={{ width: KEYBOARD_W }}>
        <span className="roll-viewport__corner-label">鍵盤</span>
        <span className="roll-viewport__corner-range">{pitchJaRangeLabel(PITCH_MIN, PITCH_MAX)}</span>
      </div>
      <BeatRuler
        rulerRef={rulerScrollRef}
        beatsVisible={beatsVisible}
        loopStart={loopStart}
        loopEnd={loopEnd}
        loopEnabled={loopEnabled}
        playheadBeat={playheadBeat}
        playing={playing}
        quantizeGrid={quantizeGrid}
        scrollLeft={scrollLeft}
        onScroll={syncScrollX}
        onLoopChange={onLoopChange}
        onSeekBeat={onSeekBeat}
      />
      <div
        className="piano-keyboard-wrap"
        ref={keysScrollRef}
        onScroll={(e) => {
          const top = e.currentTarget.scrollTop;
          if (gridScrollRef.current && gridScrollRef.current.scrollTop !== top) {
            gridScrollRef.current.scrollTop = top;
          }
        }}
      >
        <PianoKeyboard
          activePitches={activePitches}
          drumMode={drumMode}
          onKeyDown={onPianoKeyDown}
          onKeyUp={onPianoKeyUp}
          height={height}
        />
      </div>
      <div className="roll-grid-scroll" ref={gridScrollRef} onScroll={onGridScroll}>
        <canvas
          ref={canvasRef}
          className="piano-roll__canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
      <div
        className={`roll-playhead${playing ? " roll-playhead--playing" : ""}`}
        style={{ left: KEYBOARD_W + playheadBeat * BEAT_W - scrollLeft }}
        aria-hidden
      >
        <div className="roll-playhead__line" />
      </div>
    </div>
  );
}

function hexWithAlpha(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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
