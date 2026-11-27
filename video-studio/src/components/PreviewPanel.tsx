import { Grid, Maximize2, Monitor, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getVisualClipBounds,
  hitTestVisualClip,
  onCompositorMediaReady,
  renderFrame,
} from "../preview/compositor";
import { getTelopBounds, hitTestTelop } from "../text/renderText";
import type { EditorApi } from "../hooks/useEditor";
import type { EditorState, TextClip, TimelineClip } from "../types";
import { DEFAULT_FPS, clipTimelineEnd, resolveTransform } from "../types";
import { clipsOnTrack } from "../utils/timeline";

interface Props {
  state: EditorState;
  editor?: EditorApi;
  safeZone?: boolean;
  onToggleSafeZone?: () => void;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

type DragState =
  | {
      mode: "move-text";
      clipId: string;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
    }
  | {
      mode: "scale-text";
      clipId: string;
      centerX: number;
      centerY: number;
      startDist: number;
      origFontSize: number;
    }
  | {
      mode: "move-visual";
      clipId: string;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
    }
  | {
      mode: "scale-visual";
      clipId: string;
      centerX: number;
      centerY: number;
      startDist: number;
      origScale: number;
    };

const ASPECT_PRESETS: { label: string; w: number; h: number }[] = [
  { label: "16:9 横", w: 1920, h: 1080 },
  { label: "9:16 縦", w: 1080, h: 1920 },
  { label: "1:1 正方", w: 1080, h: 1080 },
  { label: "720p 軽量", w: 1280, h: 720 },
];

export const PreviewPanel = ({
  state,
  editor,
  safeZone = false,
  onToggleSafeZone,
  onCanvasReady,
}: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const dragRef = useRef<DragState | null>(null);
  const [snapCenter, setSnapCenter] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 640, h: 360 });
  const [inlineTextId, setInlineTextId] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) onCanvasReady?.(canvas);
  }, [onCanvasReady]);

  // 親領域サイズに合わせて正確にアスペクト比を維持したステージ寸法を算出
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const compute = () => {
      const rect = wrap.getBoundingClientRect();
      const pad = 20;
      const availW = Math.max(120, rect.width - pad);
      const availH = Math.max(90, rect.height - pad);
      const scale = Math.min(availW / state.previewWidth, availH / state.previewHeight);
      setStageSize({
        w: Math.max(1, Math.floor(state.previewWidth * scale)),
        h: Math.max(1, Math.floor(state.previewHeight * scale)),
      });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [state.previewWidth, state.previewHeight]);

  // キャンバス描画 + 停止時シーク完了時の自動再描画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== state.previewWidth) canvas.width = state.previewWidth;
    if (canvas.height !== state.previewHeight) canvas.height = state.previewHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const drawLoop = () => {
      renderFrame(ctx, stateRef.current, stateRef.current.playhead);
      rafRef.current = requestAnimationFrame(drawLoop);
    };

    if (state.isPlaying) {
      drawLoop();
    } else {
      cancelAnimationFrame(rafRef.current);
      renderFrame(ctx, state, state.playhead);
    }

    return () => cancelAnimationFrame(rafRef.current);
  }, [state]);

  useEffect(() => {
    return onCompositorMediaReady(() => {
      if (stateRef.current.isPlaying) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (ctx) renderFrame(ctx, stateRef.current, stateRef.current.playhead);
    });
  }, []);

  const toCanvasPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      return {
        x: ((clientX - rect.left) / rect.width) * state.previewWidth,
        y: ((clientY - rect.top) / rect.height) * state.previewHeight,
      };
    },
    [state.previewWidth, state.previewHeight]
  );

  // 現在時刻で画面上に存在する選択中クリップのボックスを算出（DOMオーバーレイ用・出力には一切混入しない）
  const activeSelectionBox = useMemo(() => {
    const id = state.selectedClipId;
    if (!id) return null;
    const t = state.playhead;

    const tc = state.textClips.find((c) => c.id === id);
    if (tc && t >= tc.start && t < clipTimelineEnd(tc)) {
      const canvas = canvasRef.current ?? document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const b = getTelopBounds(ctx, tc, t - tc.start, state.previewWidth, state.previewHeight);
      return {
        kind: "text" as const,
        clipId: tc.id,
        leftPct: (b.left / state.previewWidth) * 100,
        topPct: (b.top / state.previewHeight) * 100,
        widthPct: (b.width / state.previewWidth) * 100,
        heightPct: (b.height / state.previewHeight) * 100,
        cx: b.anchorX,
        cy: b.anchorY,
        rotation: tc.style.rotation,
      };
    }

    const vc = state.clips.find((c) => c.id === id);
    if (!vc || t < vc.start || t >= clipTimelineEnd(vc)) return null;
    const track = state.tracks.find((tr) => tr.id === vc.trackId);
    if (!track || track.hidden || (track.kind !== "video" && track.kind !== "overlay")) return null;
    const vb = getVisualClipBounds(state, vc);
    if (!vb) return null;
    return {
      kind: "visual" as const,
      clipId: vc.id,
      leftPct: (vb.left / state.previewWidth) * 100,
      topPct: (vb.top / state.previewHeight) * 100,
      widthPct: (vb.width / state.previewWidth) * 100,
      heightPct: (vb.height / state.previewHeight) * 100,
      cx: vb.cx,
      cy: vb.cy,
      rotation: vb.rotation,
    };
  }, [state]);

  const hitTopmostLayer = useCallback(
    (px: number, py: number): { kind: "text"; clip: TextClip } | { kind: "visual"; clip: TimelineClip } | null => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const t = state.playhead;
      if (ctx) {
        const visibleTextTracks = new Set(
          state.tracks.filter((tr) => tr.kind === "text" && !tr.hidden && !tr.locked).map((tr) => tr.id)
        );
        const textCandidates = state.textClips.filter(
          (c) => visibleTextTracks.has(c.trackId) && t >= c.start && t < clipTimelineEnd(c)
        );
        for (let i = textCandidates.length - 1; i >= 0; i--) {
          const tc = textCandidates[i]!;
          if (hitTestTelop(ctx, tc, t - tc.start, state.previewWidth, state.previewHeight, px, py)) {
            return { kind: "text", clip: tc };
          }
        }
      }

      // オーバーレイ（手前） → 映像トラック（上位から下位へ）
      const visualTracks = [
        ...state.tracks.filter((tr) => tr.kind === "overlay" && !tr.hidden && !tr.locked).reverse(),
        ...state.tracks.filter((tr) => tr.kind === "video" && !tr.hidden && !tr.locked).reverse(),
      ];
      for (const tr of visualTracks) {
        const list = clipsOnTrack(state.clips, tr.id);
        for (let i = list.length - 1; i >= 0; i--) {
          const c = list[i]!;
          if (t < c.start || t >= clipTimelineEnd(c)) continue;
          if (hitTestVisualClip(state, c, px, py)) {
            return { kind: "visual", clip: c };
          }
        }
      }
      return null;
    },
    [state]
  );

  const startMove = (e: React.PointerEvent) => {
    if (!editor || inlineTextId) return;
    const pt = toCanvasPoint(e.clientX, e.clientY);
    if (!pt) return;

    const hit = hitTopmostLayer(pt.x, pt.y);
    if (!hit) {
      editor.patch({ selectedClipId: null });
      return;
    }

    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    editor.beginGesture();
    editor.patch({ selectedClipId: hit.clip.id, selectedTrackId: hit.clip.trackId });

    if (hit.kind === "text") {
      dragRef.current = {
        mode: "move-text",
        clipId: hit.clip.id,
        startX: pt.x,
        startY: pt.y,
        origX: hit.clip.x,
        origY: hit.clip.y,
      };
    } else {
      const tr = resolveTransform(hit.clip);
      dragRef.current = {
        mode: "move-visual",
        clipId: hit.clip.id,
        startX: pt.x,
        startY: pt.y,
        origX: tr.x,
        origY: tr.y,
      };
    }
  };

  const startScaleHandle = (e: React.PointerEvent) => {
    if (!editor || !activeSelectionBox) return;
    e.stopPropagation();
    e.preventDefault();
    const pt = toCanvasPoint(e.clientX, e.clientY);
    if (!pt) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    editor.beginGesture();

    const dist = Math.max(12, Math.hypot(pt.x - activeSelectionBox.cx, pt.y - activeSelectionBox.cy));
    if (activeSelectionBox.kind === "text") {
      const tc = state.textClips.find((c) => c.id === activeSelectionBox.clipId);
      if (!tc) return;
      dragRef.current = {
        mode: "scale-text",
        clipId: tc.id,
        centerX: activeSelectionBox.cx,
        centerY: activeSelectionBox.cy,
        startDist: dist,
        origFontSize: tc.style.fontSize,
      };
    } else {
      const vc = state.clips.find((c) => c.id === activeSelectionBox.clipId);
      if (!vc) return;
      dragRef.current = {
        mode: "scale-visual",
        clipId: vc.id,
        centerX: activeSelectionBox.cx,
        centerY: activeSelectionBox.cy,
        startDist: dist,
        origScale: resolveTransform(vc).scale,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!editor || !drag) return;
    const pt = toCanvasPoint(e.clientX, e.clientY);
    if (!pt) return;

    if (drag.mode === "move-text" || drag.mode === "move-visual") {
      const dx = (pt.x - drag.startX) / state.previewWidth;
      const dy = (pt.y - drag.startY) / state.previewHeight;
      let nx = drag.origX + dx;
      let ny = drag.origY + dy;
      let sx = false;
      let sy = false;
      if (!e.altKey) {
        if (Math.abs(nx - 0.5) < 0.018) {
          nx = 0.5;
          sx = true;
        }
        if (Math.abs(ny - 0.5) < 0.018) {
          ny = 0.5;
          sy = true;
        }
      }
      setSnapCenter({ x: sx, y: sy });

      if (drag.mode === "move-text") {
        editor.updateClip(drag.clipId, {
          x: Math.min(1.2, Math.max(-0.2, nx)),
          y: Math.min(1.2, Math.max(-0.2, ny)),
        });
      } else {
        editor.updateTransform(drag.clipId, {
          x: Math.min(1.5, Math.max(-0.5, nx)),
          y: Math.min(1.5, Math.max(-0.5, ny)),
        });
      }
      return;
    }

    if (drag.mode === "scale-text") {
      const dist = Math.max(8, Math.hypot(pt.x - drag.centerX, pt.y - drag.centerY));
      const nextSize = Math.round(Math.min(240, Math.max(12, drag.origFontSize * (dist / drag.startDist))));
      editor.updateTextStyle(drag.clipId, { fontSize: nextSize });
      return;
    }

    if (drag.mode === "scale-visual") {
      const dist = Math.max(8, Math.hypot(pt.x - drag.centerX, pt.y - drag.centerY));
      const nextScale = Number(
        Math.min(6, Math.max(0.1, drag.origScale * (dist / drag.startDist))).toFixed(3)
      );
      editor.updateTransform(drag.clipId, { scale: nextScale });
    }
  };

  const endDrag = () => {
    if (dragRef.current) {
      editor?.endGesture();
      dragRef.current = null;
      setSnapCenter({ x: false, y: false });
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!editor) return;
    const pt = toCanvasPoint(e.clientX, e.clientY);
    if (!pt) return;
    const hit = hitTopmostLayer(pt.x, pt.y);
    if (hit?.kind === "text") {
      editor.patch({ selectedClipId: hit.clip.id });
      setInlineTextId(hit.clip.id);
    }
  };

  const inlineTextClip = inlineTextId
    ? state.textClips.find((c) => c.id === inlineTextId) ?? null
    : null;
  const empty = state.clips.length === 0 && state.textClips.length === 0;
  const currentResKey = `${state.previewWidth}x${state.previewHeight}`;
  const selectedVisual =
    activeSelectionBox?.kind === "visual"
      ? state.clips.find((c) => c.id === activeSelectionBox.clipId) ?? null
      : null;

  return (
    <div className="preview-panel">
      <div className="preview-panel__chrome">
        <div className="preview-panel__chrome-left">
          <Monitor size={14} />
          <div className="aspect-pills" role="group" aria-label="キャンバス比率">
            {ASPECT_PRESETS.map((p) => {
              const key = `${p.w}x${p.h}`;
              return (
                <button
                  key={key}
                  type="button"
                  className={`aspect-pill ${currentResKey === key ? "aspect-pill--active" : ""}`}
                  onClick={() => editor?.patch({ previewWidth: p.w, previewHeight: p.h })}
                  title={`${p.w}×${p.h}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <select
            className="preview-panel__fps"
            value={state.fps ?? DEFAULT_FPS}
            onChange={(e) => editor?.patch({ fps: Number(e.target.value) })}
            title="書き出し・フレーム送り FPS"
          >
            <option value={24}>24 fps</option>
            <option value={30}>30 fps</option>
            <option value={60}>60 fps</option>
          </select>
        </div>

        <div className="preview-panel__chrome-right">
          {selectedVisual && editor && (
            <>
              <button
                type="button"
                className="preview-tool-btn"
                onClick={() => {
                  const cur = resolveTransform(selectedVisual).fit;
                  editor.updateTransform(selectedVisual.id, {
                    fit: cur === "contain" ? "cover" : "contain",
                  });
                }}
                title="画面フィット切替（余白あり / 画面いっぱい）"
              >
                <Maximize2 size={12} />
                {resolveTransform(selectedVisual).fit === "cover" ? "Cover" : "Contain"}
              </button>
              <button
                type="button"
                className="preview-tool-btn"
                onClick={() => editor.resetTransform(selectedVisual.id)}
                title="位置・拡大率をリセット"
              >
                <RotateCcw size={12} />
                位置リセット
              </button>
            </>
          )}
          {onToggleSafeZone && (
            <button
              type="button"
              className={`preview-tool-btn ${safeZone ? "preview-tool-btn--active" : ""}`}
              onClick={onToggleSafeZone}
              title="字幕・タイトル安全枠の表示"
            >
              <Grid size={12} />
              ガイド
            </button>
          )}
          <span className="preview-panel__res">
            {state.previewWidth}×{state.previewHeight}
          </span>
        </div>
      </div>

      <div ref={wrapRef} className={`preview ${empty ? "preview--empty" : ""}`}>
        <div
          className="preview__stage"
          style={{ width: stageSize.w, height: stageSize.h }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={onDoubleClick}
        >
          <canvas
            ref={canvasRef}
            className="preview__canvas"
            onPointerDown={startMove}
          />

          {/* 安全枠ガイド（DOMオーバーレイなので書き出しには写らない） */}
          {safeZone && (
            <div className="preview__safezone" aria-hidden>
              <div className="preview__safezone-action" />
              <div className="preview__safezone-title" />
            </div>
          )}

          {/* 中央吸着ガイド線 */}
          {snapCenter.x && <div className="preview__guide preview__guide--v" aria-hidden />}
          {snapCenter.y && <div className="preview__guide preview__guide--h" aria-hidden />}

          {/* 選択レイヤーの変形ギズモ（四隅ドラッグでリサイズ） */}
          {activeSelectionBox && editor && !inlineTextClip && (
            <div
              className="preview__gizmo"
              style={{
                left: `${activeSelectionBox.leftPct}%`,
                top: `${activeSelectionBox.topPct}%`,
                width: `${activeSelectionBox.widthPct}%`,
                height: `${activeSelectionBox.heightPct}%`,
                transform: activeSelectionBox.rotation
                  ? `rotate(${activeSelectionBox.rotation}deg)`
                  : undefined,
              }}
            >
              {(["nw", "ne", "sw", "se"] as const).map((pos) => (
                <span
                  key={pos}
                  className={`preview__handle preview__handle--${pos}`}
                  onPointerDown={startScaleHandle}
                />
              ))}
            </div>
          )}

          {/* ダブルクリックその場テロップ編集 */}
          {inlineTextClip && editor && (
            <div className="preview__inline-editor" onClick={(e) => e.stopPropagation()}>
              <textarea
                autoFocus
                rows={3}
                value={inlineTextClip.text}
                onChange={(e) => editor.updateClip(inlineTextClip.id, { text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Escape" || ((e.ctrlKey || e.metaKey) && e.key === "Enter")) {
                    setInlineTextId(null);
                  }
                }}
                onBlur={() => setInlineTextId(null)}
              />
              <span className="preview__inline-hint">Ctrl+Enter または外側クリックで確定</span>
            </div>
          )}

          {empty && (
            <p className="preview__placeholder">
              左のメディアまたは PC フォルダから動画・画像・音声をドロップして編集開始
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
