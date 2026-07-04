import { BookOpen, FolderOpen } from "lucide-react";
import type { SidebarTab } from "../hooks/useUiPrefs";
import type { EditorState } from "../types";
import { GuidePanel } from "./GuidePanel";
import { MediaLibrary } from "./MediaLibrary";

interface Props {
  state: EditorState;
  tab: SidebarTab;
  isPro: boolean;
  onTab: (t: SidebarTab) => void;
  onImport: () => void;
  onImportDaw: () => void;
  onAddToTimeline: (id: string, at?: number) => void;
  onAddTelop: (presetId: string) => void;
}

export const Sidebar = ({
  state,
  tab,
  isPro,
  onTab,
  onImport,
  onImportDaw,
  onAddToTimeline,
  onAddTelop,
}: Props) => (
  <aside className="sidebar">
    <div className="sidebar__tabs" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={tab === "guide"}
        className={`sidebar__tab ${tab === "guide" ? "sidebar__tab--active" : ""}`}
        onClick={() => onTab("guide")}
      >
        <BookOpen size={15} />
        ガイド
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "media"}
        className={`sidebar__tab ${tab === "media" ? "sidebar__tab--active" : ""}`}
        onClick={() => onTab("media")}
      >
        <FolderOpen size={15} />
        メディア
        {state.assets.length > 0 && (
          <span className="sidebar__badge">{state.assets.length}</span>
        )}
      </button>
    </div>
    <div className="sidebar__body">
      {tab === "guide" ? (
        <GuidePanel
          state={state}
          isPro={isPro}
          onImportMedia={onImport}
          onImportDaw={onImportDaw}
          onFocusMedia={() => onTab("media")}
        />
      ) : (
        <MediaLibrary
          state={state}
          onImport={onImport}
          onImportDaw={onImportDaw}
          onAddToTimeline={onAddToTimeline}
          onAddTelop={onAddTelop}
        />
      )}
    </div>
  </aside>
);
