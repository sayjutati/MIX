import { useEffect, useState } from "react";
import { Copy, Eye, EyeOff, Lock, Trash2, ChevronUp, ChevronDown, Unlock } from "lucide-react";
import { LayerThumb } from "./LayerThumb";
import { usePhotoStore } from "../state/usePhotoStore";

const LayerNameInput = ({ id, name }: { id: string; name: string }) => {
  const [draft, setDraft] = useState(name);
  const commit = usePhotoStore((s) => s.commit);

  useEffect(() => setDraft(name), [name]);

  return (
    <input
      className="layer-list__name"
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== name) {
          commit((p) => ({
            ...p,
            layers: p.layers.map((l) => (l.id === id ? { ...l, name: draft.trim() || "レイヤー" } : l)),
          }));
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
};

export const LayerPanel = () => {
  const project = usePhotoStore((s) => s.project);
  const selectedId = usePhotoStore((s) => s.selectedLayerId);
  const selectLayer = usePhotoStore((s) => s.selectLayer);
  const toggleVisibility = usePhotoStore((s) => s.toggleLayerVisibility);
  const toggleLock = usePhotoStore((s) => s.toggleLayerLock);
  const reorderLayer = usePhotoStore((s) => s.reorderLayer);
  const removeLayer = usePhotoStore((s) => s.removeLayer);
  const duplicateLayer = usePhotoStore((s) => s.duplicateLayer);

  const layers = [...project.layers].reverse();

  return (
    <div className="panel">
      <h2 className="panel__title">レイヤー ({project.layers.length})</h2>
      {layers.length === 0 && (
        <p className="panel__empty">生成または読込でレイヤーを追加</p>
      )}
      <ul className="layer-list">
        {layers.map((l) => (
          <li
            key={l.id}
            className={`layer-list__item ${selectedId === l.id ? "layer-list__item--selected" : ""} ${l.locked ? "layer-list__item--locked" : ""}`}
            onClick={() => selectLayer(l.id)}
          >
            <LayerThumb layer={l} />
            <button
              type="button"
              className="layer-list__vis"
              onClick={(e) => {
                e.stopPropagation();
                toggleVisibility(l.id);
              }}
            >
              {l.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            <LayerNameInput id={l.id} name={l.name} />
            <div className="layer-list__actions">
              <button
                type="button"
                title={l.locked ? "ロック解除" : "ロック"}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLock(l.id);
                }}
              >
                {l.locked ? <Lock size={14} /> : <Unlock size={14} />}
              </button>
              <button type="button" title="上へ" onClick={(e) => { e.stopPropagation(); reorderLayer(l.id, "up"); }}>
                <ChevronUp size={14} />
              </button>
              <button type="button" title="下へ" onClick={(e) => { e.stopPropagation(); reorderLayer(l.id, "down"); }}>
                <ChevronDown size={14} />
              </button>
              <button type="button" title="複製" onClick={(e) => { e.stopPropagation(); duplicateLayer(l.id); }}>
                <Copy size={14} />
              </button>
              <button type="button" title="削除" disabled={l.locked} onClick={(e) => { e.stopPropagation(); removeLayer(l.id); }}>
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
