import { BookOpen, Captions, Download, FolderOpen, Plus, Type } from "lucide-react";
import type { EditorApi } from "../hooks/useEditor";
import type { SidebarTab } from "../hooks/useUiPrefs";
import { TELOP_PRESETS } from "../text/telopPresets";
import type { EditorState } from "../types";
import { GuidePanel } from "./GuidePanel";
import { MediaLibrary } from "./MediaLibrary";

interface Props {
  state: EditorState;
  editor: EditorApi;
  tab: SidebarTab;
  isPro: boolean;
  onTab: (t: SidebarTab) => void;
  onImport: () => void;
  onImportDaw: () => void;
  onImportCaptions: () => void;
  onExportCaptions: () => void;
  onDropFiles: (files: FileList) => void;
  onAddToTimeline: (id: string, at?: number) => void;
  onAddTelop: (presetId: string) => void;
}

export const Sidebar = ({
  state,
  editor,
  tab,
  isPro,
  onTab,
  onImport,
  onImportDaw,
  onImportCaptions,
  onExportCaptions,
  onDropFiles,
  onAddToTimeline,
  onAddTelop,
}: Props) => (
  <aside className="sidebar">
    <div className="sidebar__tabs" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={tab === "media"}
        className={`sidebar__tab ${tab === "media" ? "sidebar__tab--active" : ""}`}
        onClick={() => onTab("media")}
      >
        <FolderOpen size={14} />
        メディア
        {state.assets.length > 0 && <span className="sidebar__badge">{state.assets.length}</span>}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "telop"}
        className={`sidebar__tab ${tab === "telop" ? "sidebar__tab--active" : ""}`}
        onClick={() => onTab("telop")}
      >
        <Type size={14} />
        テロップ
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "guide"}
        className={`sidebar__tab ${tab === "guide" ? "sidebar__tab--active" : ""}`}
        onClick={() => onTab("guide")}
      >
        <BookOpen size={14} />
        ガイド
      </button>
    </div>

    <div className="sidebar__body">
      {tab === "media" && (
        <MediaLibrary
          state={state}
          editor={editor}
          onImport={onImport}
          onImportDaw={onImportDaw}
          onImportCaptions={onImportCaptions}
          onDropFiles={onDropFiles}
          onAddToTimeline={onAddToTimeline}
        />
      )}

      {tab === "telop" && (
        <div className="telop-library">
          <div className="telop-library__actions">
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => editor.addTextClip()}
            >
              <Plus size={15} />
              標準テロップを現在位置へ追加
            </button>
            <button type="button" className="btn btn--block" onClick={onImportCaptions}>
              <Captions size={15} />
              SRT / VTT / LRC 歌詞を一括配置
            </button>
            {state.textClips.length > 0 && (
              <button type="button" className="btn btn--block btn--ghost" onClick={onExportCaptions}>
                <Download size={15} />
                テロップを SRT 字幕として書き出し
              </button>
            )}
          </div>

          <h3 className="media-lib__heading">デザインプリセット（クリックで追加）</h3>
          <div className="telop-library__grid">
            {TELOP_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="telop-card"
                onClick={() => onAddTelop(p.id)}
              >
                <span className="telop-card__preview" style={{ color: p.style.color }}>
                  Aa {p.name}
                </span>
                <span className="telop-card__desc">{p.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "guide" && (
        <GuidePanel
          state={state}
          isPro={isPro}
          onImportMedia={onImport}
          onImportDaw={onImportDaw}
          onFocusMedia={() => onTab("media")}
        />
      )}
    </div>
  </aside>
);
