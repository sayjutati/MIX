import { Plus, Upload } from "lucide-react";
import type { EditorState } from "../types";

interface Props {
  state: EditorState;
  onImport: () => void;
  onImportDaw: () => void;
  onAddToTimeline: (assetId: string) => void;
}

const badgeLabel = (state: EditorState, assetId: string) => {
  const a = state.assets.find((x) => x.id === assetId);
  if (!a) return "";
  if (a.kind === "video") return a.hasAudio === false ? "映像のみ" : "映像+音声";
  if (a.kind === "audio") return "音声";
  return "画像";
};

export const MediaLibrary = ({ state, onImport, onImportDaw, onAddToTimeline }: Props) => (
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

    <h3 className="media-lib__heading">ライブラリ ({state.assets.length})</h3>
    <ul className="media-lib__list">
      {state.assets.length === 0 && (
        <li className="media-lib__empty card">
          まだ素材がありません。上のボタンから動画や画像を追加してください。
        </li>
      )}
      {state.assets.map((a) => (
        <li key={a.id} className="media-lib__item card">
          <div className="media-lib__meta">
            <span className={`media-lib__badge media-lib__badge--${a.kind}`}>
              {badgeLabel(state, a.id)}
            </span>
            <span className="media-lib__name" title={a.name}>
              {a.name}
            </span>
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
