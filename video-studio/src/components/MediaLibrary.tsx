import { originLabel, getClipOrigin } from "../audio/clipAudio";
import type { EditorState } from "../types";

interface Props {
  state: EditorState;
  onImport: () => void;
  onImportDaw: () => void;
  onAddToTimeline: (assetId: string) => void;
}

const assetBadge = (state: EditorState, assetId: string) => {
  const asset = state.assets.find((a) => a.id === assetId);
  if (!asset) return null;
  if (asset.kind === "video") {
    return asset.hasAudio === false ? "映像のみ" : "映像+音声";
  }
  if (asset.kind === "audio") return "音声";
  return "画像";
};

export const MediaLibrary = ({ state, onImport, onImportDaw, onAddToTimeline }: Props) => (
  <aside className="media-lib">
    <div className="panel__head">
      <h2>メディア</h2>
      <button type="button" className="btn btn--sm" onClick={onImport}>
        ＋ 読込
      </button>
      <button type="button" className="btn btn--sm btn--daw" onClick={onImportDaw} title="DAW .daw → Audio 2">
        DAW
      </button>
    </div>
    <p className="media-lib__explain">
      動画を追加すると <strong>映像トラック + 音声トラック（リンク）</strong> に分かれます。DAW
      ミックスは別トラックで重ねます。
    </p>
    <ul className="media-lib__list">
      {state.assets.length === 0 && (
        <li className="media-lib__empty">動画・音声・画像、または DAW プロジェクト</li>
      )}
      {state.assets.map((a) => (
        <li key={a.id} className="media-lib__item">
          <span className={`media-lib__badge media-lib__badge--${a.kind}`}>
            {assetBadge(state, a.id)}
          </span>
          <span className="media-lib__name" title={a.name}>
            {a.name}
          </span>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => onAddToTimeline(a.id)}
            title="タイムラインへ追加"
          >
            追加
          </button>
        </li>
      ))}
    </ul>
    {state.clips.some((c) => getClipOrigin(c) === "daw") && (
      <p className="media-lib__daw-note">DAW クリップ配置中 — {originLabel.daw}</p>
    )}
  </aside>
);
