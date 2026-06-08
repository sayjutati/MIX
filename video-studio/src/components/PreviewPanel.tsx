import { Monitor, Move } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { renderFrame } from "../preview/compositor";
import { hitTestTelop } from "../text/renderText";
import type { EditorApi } from "../hooks/useEditor";
import type { EditorState } from "../types";
import { clipTimelineEnd } from "../types";

interface Props {
  state: EditorState;
  editor?: EditorApi;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

export const PreviewPanel = ({ state, editor, onCanvasReady }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const dragRef = useRef<{ clipId: string; startX: number; startY: number; origX: number; origY: number } | null>(
    null
  );
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) onCanvasReady?.(canvas);
  }, [onCanvasReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = state.previewWidth;
    canvas.height = state.previewHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      renderFrame(ctx, state, state.playhead);
      rafRef.current = requestAnimationFrame(draw);
    };

    if (state.isPlaying) draw();
    else {
      cancelAnimationFrame(rafRef.current);
      renderFrame(ctx, state, state.playhead);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [state]);

  const canvasCoords = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  const activeTextAtPlayhead = useCallback(() => {
    const t = state.playhead;
    const selected = state.selectedClipId
      ? state.textClips.find((c) => c.id === state.selectedClipId)
      : null;
    if (selected && t >= selected.start && t < clipTimelineEnd(selected)) return selected;
    return state.textClips.find((c) => t >= c.start && t < clipTimelineEnd(c)) ?? null;
  }, [state.playhead, state.selectedClipId, state.textClips]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editor) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const pt = canvasCoords(e.clientX, e.clientY);
    if (!ctx || !pt) return;

    const candidates = state.textClips.filter(
      (c) => state.playhead >= c.start && state.playhead < clipTimelineEnd(c)
    );
    const hit =
      (state.selectedClipId &&
        candidates.find((c) => c.id === state.selectedClipId && hitTestTelop(ctx, c, state.playhead - c.start, state.previewWidth, state.previewHeight, pt.x, pt.y))) ||
      [...candidates].reverse().find((c) =>
        hitTestTelop(ctx, c, state.playhead - c.start, state.previewWidth, state.previewHeight, pt.x, pt.y)
      );

    if (!hit) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    editor.patch({ selectedClipId: hit.id });
    dragRef.current = {
      clipId: hit.id,
      startX: pt.x,
      startY: pt.y,
      origX: hit.x,
      origY: hit.y,
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!editor || !dragRef.current) return;
    const pt = canvasCoords(e.clientX, e.clientY);
    if (!pt) return;
    const dx = (pt.x - dragRef.current.startX) / state.previewWidth;
    const dy = (pt.y - dragRef.current.startY) / state.previewHeight;
    editor.updateClip(dragRef.current.clipId, {
      x: Math.min(1, Math.max(0, dragRef.current.origX + dx)),
      y: Math.min(1, Math.max(0, dragRef.current.origY + dy)),
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      dragRef.current = null;
      setDragging(false);
    }
  };

  const empty = state.clips.length === 0 && state.textClips.length === 0;
  const textActive = !!activeTextAtPlayhead();

  return (
    <div className="preview-panel">
      <div className="preview-panel__chrome">
        <Monitor size={14} />
        <span>プレビュー</span>
        <span className="preview-panel__res">
          {state.previewWidth}×{state.previewHeight}
        </span>
        {textActive && editor && (
          <span className={`preview-panel__drag-hint ${dragging ? "preview-panel__drag-hint--on" : ""}`}>
            <Move size={12} /> テロップをドラッグで移動
          </span>
        )}
      </div>
      <div ref={wrapRef} className={`preview ${empty ? "preview--empty" : ""}`}>
        {empty && (
          <p className="preview__placeholder">タイムラインにクリップを置くとここに表示されます</p>
        )}
        <canvas
          ref={canvasRef}
          className={`preview__canvas ${textActive && editor ? "preview__canvas--draggable" : ""}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
    </div>
  );
};
