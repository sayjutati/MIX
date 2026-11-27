import {
  Camera,
  Captions,
  Download,
  FolderOpen,
  HelpCircle,
  Save,
  Sparkles,
  Upload,
  XCircle,
} from "lucide-react";
import type { ExportFormat } from "../export/exportCapabilities";
import { exportFormatHint } from "../export/exportVideo";
import { IconBtn } from "./ui/IconBtn";

interface Props {
  title: string;
  onTitleChange: (next: string) => void;
  exporting: boolean;
  exportPct: number;
  exportStatus?: string;
  exportFormat: ExportFormat;
  onExportFormat: (f: ExportFormat) => void;
  onImport: () => void;
  onImportDaw: () => void;
  onImportCaptions: () => void;
  onSendFrame: () => void;
  sendingFrame?: boolean;
  onOpen: () => void;
  onSave: () => void;
  onExport: () => void;
  onCancelExport?: () => void;
  onHelp: () => void;
}

export const AppHeader = ({
  title,
  onTitleChange,
  exporting,
  exportPct,
  exportStatus,
  exportFormat,
  onExportFormat,
  onImport,
  onImportDaw,
  onImportCaptions,
  onSendFrame,
  sendingFrame,
  onOpen,
  onSave,
  onExport,
  onCancelExport,
  onHelp,
}: Props) => (
  <header className="app-header">
    <div className="app-header__brand">
      <span className="app-header__logo">MIX</span>
      <div className="app-header__titles">
        <span className="app-header__studio">Video Studio</span>
        <input
          className="app-header__project-input"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="無題のプロジェクト"
          aria-label="プロジェクト名"
        />
      </div>
    </div>

    <div className="app-header__tools">
      <IconBtn icon={Upload} label="素材追加" onClick={onImport} size="sm" />
      <IconBtn
        icon={Sparkles}
        label="DAW (.daw)"
        onClick={onImportDaw}
        size="sm"
        className="btn--daw-wrap"
      />
      <IconBtn icon={Captions} label="歌詞・字幕" onClick={onImportCaptions} size="sm" />
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={onSendFrame}
        disabled={sendingFrame}
        title="現在のフレームを高画質 PNG で Photo Studio へ送る"
      >
        <Camera size={14} />
        {sendingFrame ? "送信中…" : "サムネへ"}
      </button>

      <span className="app-header__sep" />

      <IconBtn icon={FolderOpen} label="開く" onClick={onOpen} size="sm" variant="ghost" />
      <IconBtn icon={Save} label="保存 (.vproj)" onClick={onSave} size="sm" variant="ghost" />

      <div className="export-group">
        <select
          className="export-group__select"
          value={exportFormat}
          disabled={exporting}
          onChange={(e) => onExportFormat(e.target.value as ExportFormat)}
          title={exportFormatHint(exportFormat)}
          aria-label="書き出し形式"
        >
          <option value="mp4">MP4 (H.264)</option>
          <option value="webm">WebM</option>
        </select>

        <button
          type="button"
          className="btn btn--primary btn--export"
          disabled={exporting}
          onClick={onExport}
          title={exportFormatHint(exportFormat)}
        >
          <Download size={15} />
          <span>
            {exporting
              ? exportStatus ?? `書き出し ${Math.round(exportPct * 100)}%`
              : "動画を書き出す"}
          </span>
          {exporting && (
            <span
              className="btn--export__bar"
              style={{ width: `${Math.min(100, Math.round(exportPct * 100))}%` }}
            />
          )}
        </button>

        {exporting && onCancelExport && (
          <button
            type="button"
            className="btn btn--sm btn--danger"
            onClick={onCancelExport}
            title="書き出しを中止"
          >
            <XCircle size={14} />
            中止
          </button>
        )}
      </div>

      <IconBtn icon={HelpCircle} label="操作ヘルプ (?)" onClick={onHelp} variant="ghost" size="sm" />
    </div>
  </header>
);
