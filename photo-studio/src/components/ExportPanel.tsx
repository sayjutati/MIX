import { useEffect, useState } from "react";
import { CANVAS_PRESETS, type ExportFormat } from "../types/document";
import { usePhotoStore } from "../state/usePhotoStore";

type Props = {
  onExport: (format: ExportFormat, options?: { quality?: number; transparent?: boolean }) => void;
  exporting: boolean;
};

export const ExportPanel = ({ onExport, exporting }: Props) => {
  const project = usePhotoStore((s) => s.project);
  const setProjectName = usePhotoStore((s) => s.setProjectName);
  const setCanvasSize = usePhotoStore((s) => s.setCanvasSize);
  const setBackground = usePhotoStore((s) => s.setBackground);
  const [quality, setQuality] = useState(92);
  const [transparent, setTransparent] = useState(false);
  const [nameDraft, setNameDraft] = useState(project.name);

  useEffect(() => setNameDraft(project.name), [project.name]);

  const exportOpts = { quality: quality / 100, transparent };

  return (
    <div className="panel">
      <h2 className="panel__title">書き出し・キャンバス</h2>

      <label className="field">
        プロジェクト名
        <input
          type="text"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => setProjectName(nameDraft)}
        />
      </label>

      <label className="field">
        背景色
        <input
          type="color"
          value={project.background}
          onChange={(e) => setBackground(e.target.value)}
        />
      </label>

      <label className="field">
        キャンバスサイズ
        <select
          value={
            CANVAS_PRESETS.find((x) => x.width === project.width && x.height === project.height)
              ?.id ?? CANVAS_PRESETS[0]!.id
          }
          onChange={(e) => {
            const p = CANVAS_PRESETS.find((x) => x.id === e.target.value);
            if (p) setCanvasSize(p.width, p.height);
          }}
        >
          {CANVAS_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        画質 {quality}%
        <input
          type="range"
          min={60}
          max={100}
          value={quality}
          onChange={(e) => setQuality(Number(e.target.value))}
        />
      </label>

      <label className="field field--check">
        <input
          type="checkbox"
          checked={transparent}
          onChange={(e) => setTransparent(e.target.checked)}
        />
        PNG 透過（背景なし）
      </label>

      <div className="export-btns">
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={exporting}
          onClick={() => onExport("png", exportOpts)}
        >
          PNG{transparent ? "（透過）" : ""}
        </button>
        <button
          type="button"
          className="btn btn--block"
          disabled={exporting}
          onClick={() => onExport("jpeg", exportOpts)}
        >
          JPEG
        </button>
        <button
          type="button"
          className="btn btn--block"
          disabled={exporting}
          onClick={() => onExport("webp", exportOpts)}
        >
          WebP
        </button>
      </div>
    </div>
  );
};
