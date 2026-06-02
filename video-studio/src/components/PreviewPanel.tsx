import { Monitor } from "lucide-react";
import { useEffect, useRef } from "react";
import { renderFrame } from "../preview/compositor";
import type { EditorState } from "../types";

interface Props {
  state: EditorState;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

export const PreviewPanel = ({ state, onCanvasReady }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

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

  const empty = state.clips.length === 0 && state.textClips.length === 0;

  return (
    <div className="preview-panel">
      <div className="preview-panel__chrome">
        <Monitor size={14} />
        <span>プレビュー</span>
        <span className="preview-panel__res">
          {state.previewWidth}×{state.previewHeight}
        </span>
      </div>
      <div className={`preview ${empty ? "preview--empty" : ""}`}>
        {empty && (
          <p className="preview__placeholder">タイムラインにクリップを置くとここに表示されます</p>
        )}
        <canvas ref={canvasRef} className="preview__canvas" />
      </div>
    </div>
  );
};
