import { useEffect, useRef } from "react";
import { renderLayer } from "../canvas/layerRenderer";
import { usePhotoStore } from "../state/usePhotoStore";
import type { Layer } from "../types/document";

const SIZE = 36;

export const LayerThumb = ({ layer }: { layer: Layer }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const project = usePhotoStore((s) => s.project);
  const resolveAssetUrl = usePhotoStore((s) => s.resolveAssetUrl);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scale = Math.min(SIZE / project.width, SIZE / project.height);
    ctx.save();
    ctx.scale(scale, scale);
    void renderLayer(ctx, layer, project, resolveAssetUrl);
    ctx.restore();
  }, [layer, project, resolveAssetUrl]);

  return <canvas ref={canvasRef} className="layer-list__thumb" width={SIZE} height={SIZE} />;
};
