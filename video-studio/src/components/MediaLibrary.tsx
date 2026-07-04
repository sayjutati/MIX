import { Plus, Upload } from "lucide-react";
import { TELOP_PRESETS } from "../text/telopPresets";
import type { EditorState } from "../types";
import { formatTime } from "../utils/time";

interface Props {
  state: EditorState;
  onImport: () => void;
  onImportDaw: () => void;
  onAddToTimeline: (assetId: string, at?: number) => void;
  onAddTelop: (presetId: string) => void;
}

const badgeLabel = (state: EditorState, assetId: string) => {
  const a = state.assets.find((x) => x.id === assetId);
  if (!a) return "";
  if (a.kind === "video") return a.hasAudio === false ? "映像のみ" : "映像+音声";
  if (a.kind === "audio") return "音声";
  return "画像";
};

export const MediaLibrary = ({
  state,
  onImport,
  onImportDaw,
  onAddToTimeline,
  onAddTelop,
}: Props) => (
  <div className="media-lib">
    <div className="media-lib__actions">
      <button type="button" className="btn btn--primary btn--block" onClick={onImport}>
        <Upload size={16} />
        ファイルを追加
      </button>
      <button type="button" className="btn btn--block btn--daw" onClick={onImportDaw}>
        DAW ミックス (.daw)
      </button>
    </div>

    <h3 className="media-lib__heading">テロップを追加</h3>
    <div className="media-lib__telop-grid">
      {TELOP_PRESETS.slice(0, 6).map((p) => (
        <button
          key={p.id}
          type="button"
          className="media-lib__telop-chip"
          title={p.description}
          onClick={() => onAddTelop(p.id)}
        >
          {p.name}
        </button>
      ))}
    </div>

    <h3 className="media-lib__heading">ライブラリ ({state.assets.length})</h3>
    <ul className="media-lib__list">
      {state.assets.length === 0 && (
        <li className="media-lib__empty card">
          動画・音声・画像を追加するか、下のテロップから始められます。素材はタイムラインへドラッグでも配置できます。
        </li>
      )}
      {state.assets.map((a) => (
        <li
          key={a.id}
          className="media-lib__item card"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/x-mix-asset", a.id);
            e.dataTransfer.effectAllowed = "copy";
          }}
        >
          <div className="media-lib__thumb" aria-hidden>
            {a.kind === "video" ? (
              <video src={a.url} muted preload="metadata" />
            ) : a.kind === "image" ? (
              <img src={a.url} alt="" />
            ) : (
              <span className="media-lib__thumb-audio">♪</span>
            )}
          </div>
          <div className="media-lib__meta">
            <span className={`media-lib__badge media-lib__badge--${a.kind}`}>
              {badgeLabel(state, a.id)}
            </span>
            <span className="media-lib__name" title={a.name}>
              {a.name}
            </span>
            <span className="media-lib__dur">{formatTime(a.duration)}</span>
          </div>
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={() => onAddToTimeline(a.id)}
            title="現在の再生位置に配置"
          >
            <Plus size={14} />
            配置
          </button>
        </li>
      ))}
    </ul>
  </div>
);
