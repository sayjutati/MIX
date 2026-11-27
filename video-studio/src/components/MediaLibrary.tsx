import { Captions, Film, Image, Music, Plus, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import type { EditorApi } from "../hooks/useEditor";
import type { EditorState, MediaKind } from "../types";
import { formatTime } from "../utils/time";

interface Props {
  state: EditorState;
  editor: EditorApi;
  onImport: () => void;
  onImportDaw: () => void;
  onImportCaptions: () => void;
  onDropFiles: (files: FileList) => void;
  onAddToTimeline: (assetId: string, at?: number) => void;
}

const badgeLabel = (state: EditorState, assetId: string) => {
  const a = state.assets.find((x) => x.id === assetId);
  if (!a) return "";
  if (a.kind === "video") return a.hasAudio === false ? "映像" : "映像+音";
  if (a.kind === "audio") return "音声";
  return "画像";
};

export const MediaLibrary = ({
  state,
  editor,
  onImport,
  onImportDaw,
  onImportCaptions,
  onDropFiles,
  onAddToTimeline,
}: Props) => {
  const [filter, setFilter] = useState<"all" | MediaKind>("all");
  const [dragOver, setDragOver] = useState(false);

  const filtered =
    filter === "all" ? state.assets : state.assets.filter((a) => a.kind === filter);

  return (
    <div
      className={`media-lib ${dragOver ? "media-lib--drop" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          if (!dragOver) setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          e.preventDefault();
          onDropFiles(e.dataTransfer.files);
        }
      }}
    >
      <button type="button" className="media-dropzone" onClick={onImport}>
        <Upload size={18} />
        <div>
          <strong>動画・音声・画像・他スタジオ素材を追加</strong>
          <span>ドロップまたは Ctrl+V 貼付（.daw / .pphoto / 字幕も対応）</span>
        </div>
      </button>

      <div className="media-lib__sub-actions">
        <button type="button" className="btn btn--sm btn--daw" onClick={onImportDaw}>
          <Music size={13} /> DAW / Photo (.daw/.pphoto)
        </button>
        <button type="button" className="btn btn--sm" onClick={onImportCaptions}>
          <Captions size={13} /> 歌詞・字幕 (SRT/LRC)
        </button>
      </div>

      <div className="media-lib__filters" role="tablist">
        {(
          [
            ["all", "すべて"],
            ["video", "動画"],
            ["audio", "音声"],
            ["image", "画像"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`filter-pill ${filter === id ? "filter-pill--active" : ""}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="media-lib__list">
        {filtered.length === 0 && (
          <li className="media-lib__empty">
            {state.assets.length === 0
              ? "まだ素材がありません。上の枠へ動画・音楽・イラストをドロップするか、「テロップ」タブから文字を追加できます。"
              : "該当する種類の素材がありません。"}
          </li>
        )}
        {filtered.map((a) => (
          <li
            key={a.id}
            className="media-lib__item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-mix-asset", a.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onDoubleClick={() => onAddToTimeline(a.id)}
            title="タイムラインへドラッグ、またはダブルクリックで現在位置へ配置"
          >
            <div className="media-lib__thumb" aria-hidden>
              {a.kind === "video" ? (
                <video src={a.url} muted preload="metadata" />
              ) : a.kind === "image" ? (
                <img src={a.url} alt="" />
              ) : (
                <span className="media-lib__thumb-audio">
                  {a.kind === "audio" ? <Music size={16} /> : <Film size={16} />}
                </span>
              )}
            </div>
            <div className="media-lib__meta">
              <div className="media-lib__meta-top">
                <span className={`media-lib__badge media-lib__badge--${a.kind}`}>
                  {a.kind === "image" && <Image size={10} />}
                  {badgeLabel(state, a.id)}
                </span>
                <span className="media-lib__dur">{formatTime(a.duration)}</span>
              </div>
              <span className="media-lib__name" title={a.name}>
                {a.name}
              </span>
            </div>
            <div className="media-lib__item-btns">
              <button
                type="button"
                className="btn btn--sm btn--primary"
                onClick={() => onAddToTimeline(a.id)}
                title="再生位置（重なる場合は空き位置）へ配置"
              >
                <Plus size={13} />
              </button>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => editor.removeAsset(a.id)}
                title="素材を削除（タイムライン上のクリップも削除されます）"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
