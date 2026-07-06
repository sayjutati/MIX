import { useEffect, useState } from "react";
import {
  Download,
  FolderOpen,
  HelpCircle,
  Redo2,
  Save,
  Undo2,
  Upload,
} from "lucide-react";
import type { ExportFormat } from "../types/document";

type Props = {
  title: string;
  canUndo: boolean;
  canRedo: boolean;
  exporting: boolean;
  onImport: () => void;
  onSave: () => void;
  onOpen: () => void;
  onExport: (format: ExportFormat) => void;
  onUndo: () => void;
  onRedo: () => void;
  onRename: (name: string) => void;
  onHelp: () => void;
};

export const AppHeader = ({
  title,
  canUndo,
  canRedo,
  exporting,
  onImport,
  onSave,
  onOpen,
  onExport,
  onUndo,
  onRedo,
  onRename,
  onHelp,
}: Props) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  const commitName = () => {
    setEditing(false);
    onRename(draft.trim() || "無題");
  };

  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__logo">MIX Photo</span>
        {editing ? (
          <input
            className="header__title-input"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") {
                setDraft(title);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button type="button" className="header__title-btn" onClick={() => { setDraft(title); setEditing(true); }}>
            {title}
          </button>
        )}
      </div>
      <div className="header__tools">
        <button type="button" className="btn btn--ghost" onClick={onUndo} disabled={!canUndo} title="元に戻す (Ctrl+Z)">
          <Undo2 size={16} />
        </button>
        <button type="button" className="btn btn--ghost" onClick={onRedo} disabled={!canRedo} title="やり直し">
          <Redo2 size={16} />
        </button>
        <span className="header__sep" />
        <button type="button" className="btn btn--ghost" onClick={onImport}>
          <Upload size={16} />
          読込
        </button>
        <button type="button" className="btn btn--ghost" onClick={onOpen}>
          <FolderOpen size={16} />
          開く
        </button>
        <button type="button" className="btn btn--ghost" onClick={onSave} title="Ctrl+S">
          <Save size={16} />
          保存
        </button>
        <div className="header__export">
          <button type="button" className="btn btn--primary" disabled={exporting} onClick={() => onExport("png")}>
            <Download size={16} />
            {exporting ? "書出中…" : "PNG"}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" disabled={exporting} onClick={() => onExport("jpeg")}>
            JPEG
          </button>
          <button type="button" className="btn btn--ghost btn--sm" disabled={exporting} onClick={() => onExport("webp")}>
            WebP
          </button>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onHelp} title="ヘルプ">
          <HelpCircle size={16} />
        </button>
      </div>
    </header>
  );
};
