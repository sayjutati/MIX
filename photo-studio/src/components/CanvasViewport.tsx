import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { clientToCanvas, hitTestLayer } from "../canvas/layerHitTest";
import { renderProject } from "../canvas/layerRenderer";
import { usePhotoStore, useSelectedLayer } from "../state/usePhotoStore";

type DragMode = "move" | "pan" | null;

export const CanvasViewport = ({ onDropFiles }: { onDropFiles?: (files: File[]) => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const project = usePhotoStore((s) => s.project);
  const zoom = usePhotoStore((s) => s.zoom);
  const panX = usePhotoStore((s) => s.panX);
  const panY = usePhotoStore((s) => s.panY);
  const selectedId = usePhotoStore((s) => s.selectedLayerId);
  const renderError = usePhotoStore((s) => s.renderError);
  const resolveAssetUrl = usePhotoStore((s) => s.resolveAssetUrl);
  const hydrateAssets = usePhotoStore((s) => s.hydrateAssets);
  const patch = usePhotoStore((s) => s.patch);
  const selectLayer = usePhotoStore((s) => s.selectLayer);
  const moveLayer = usePhotoStore((s) => s.moveLayer);
  const beginGesture = usePhotoStore((s) => s.beginGesture);
  const endGesture = usePhotoStore((s) => s.endGesture);
  const fitToView = usePhotoStore((s) => s.fitToView);
  const resetView = usePhotoStore((s) => s.resetView);

  const selectedLayer = useSelectedLayer();
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const dragRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [dragOver, setDragOver] = useState(false);
  const spaceRef = useRef(false);

  useEffect(() => {
    void hydrateAssets();
  }, [project.id, project.layers.length, hydrateAssets]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = project.width;
    canvas.height = project.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    patch({ renderError: null });
    renderProject(ctx, project, resolveAssetUrl)
      .then(() => patch({ renderError: null }))
      .catch(() => patch({ renderError: "キャンバスの描画に失敗しました" }));
  }, [project, resolveAssetUrl, patch]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        spaceRef.current = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const canvasPoint = useCallback(
    (clientX: number, clientY: number) => {
      const rect = innerRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return clientToCanvas(clientX, clientY, rect, project.width, project.height);
    },
    [project.width, project.height]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || spaceRef.current) {
      setDragMode("pan");
      dragRef.current = { x: e.clientX, y: e.clientY, panX, panY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const pt = canvasPoint(e.clientX, e.clientY);
    if (!pt) return;
    const hit = hitTestLayer(project, pt.x, pt.y);
    if (hit) {
      selectLayer(hit);
      const layer = project.layers.find((l) => l.id === hit);
      if (layer && !layer.locked) {
        beginGesture();
        setDragMode("move");
        dragRef.current = { x: e.clientX, y: e.clientY, panX: 0, panY: 0 };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
    } else {
      selectLayer(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragMode === "pan") {
      patch({
        panX: dragRef.current.panX + (e.clientX - dragRef.current.x),
        panY: dragRef.current.panY + (e.clientY - dragRef.current.y),
      });
      return;
    }
    if (dragMode === "move" && selectedId) {
      const rect = innerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = ((e.clientX - dragRef.current.x) / rect.width) * project.width;
      const dy = ((e.clientY - dragRef.current.y) / rect.height) * project.height;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        moveLayer(selectedId, dx, dy);
        dragRef.current.x = e.clientX;
        dragRef.current.y = e.clientY;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragMode === "move") endGesture();
    setDragMode(null);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      patch({ zoom: Math.max(0.08, Math.min(4, zoom + delta)) });
    }
  };

  const handleFit = () => {
    const el = viewportRef.current;
    if (el) fitToView(el.clientWidth, el.clientHeight);
  };

  const cursor =
    dragMode === "pan" || spaceRef.current
      ? "grab"
      : dragMode === "move"
        ? "grabbing"
        : "default";

  return (
    <div
      className={`viewport ${dragOver ? "viewport--drag" : ""}`}
      ref={viewportRef}
      onWheel={onWheel}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
        if (files.length && onDropFiles) onDropFiles(files);
      }}
    >
      <div className="viewport__toolbar">
        <button type="button" className="btn btn--ghost btn--sm" title="ズームアウト" onClick={() => patch({ zoom: Math.max(0.08, zoom - 0.15) })}>
          <ZoomOut size={14} />
        </button>
        <span className="viewport__zoom">{Math.round(zoom * 100)}%</span>
        <button type="button" className="btn btn--ghost btn--sm" title="ズームイン" onClick={() => patch({ zoom: Math.min(4, zoom + 0.15) })}>
          <ZoomIn size={14} />
        </button>
        <button type="button" className="btn btn--ghost btn--sm" title="画面に合わせる" onClick={handleFit}>
          <Maximize2 size={14} />
        </button>
        <button type="button" className="btn btn--ghost btn--sm" title="100%" onClick={resetView}>
          100%
        </button>
      </div>

      <div
        className="viewport__stage"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div
          className="viewport__inner"
          ref={innerRef}
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            width: project.width,
            height: project.height,
          }}
        >
          <canvas ref={canvasRef} className="viewport__canvas" />
        </div>
      </div>

      <div className="viewport__info">
        {project.width} × {project.height}
        {selectedLayer && ` · ${selectedLayer.name}`}
        {renderError && <span className="viewport__error"> · {renderError}</span>}
      </div>

      {dragOver && <div className="viewport__drop-hint">画像をドロップして読み込み</div>}
    </div>
  );
};
