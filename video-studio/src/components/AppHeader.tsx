import {
  Download,
  FolderOpen,
  HelpCircle,
  Save,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from "lucide-react";
import type { ExportFormat } from "../export/exportCapabilities";
import { exportFormatHint } from "../export/exportVideo";
import type { UiMode } from "../hooks/useUiPrefs";
import { IconBtn } from "./ui/IconBtn";

interface Props {
  title: string;
  mode: UiMode;
  exporting: boolean;
  exportPct: number;
  exportStatus?: string;
  exportFormat: ExportFormat;
  onExportFormat: (f: ExportFormat) => void;
  onImport: () => void;
  onImportDaw: () => void;
  onOpen: () => void;
  onSave: () => void;
  onExport: () => void;
  onToggleMode: () => void;
  onHelp: () => void;
}

export const AppHeader = ({
  title,
  mode,
  exporting,
  exportPct,
  exportStatus,
  exportFormat,
  onExportFormat,
  onImport,
  onImportDaw,
  onOpen,
  onSave,
  onExport,
  onToggleMode,
  onHelp,
}: Props) => (
  <header className="app-header">
    <div className="app-header__brand">
      <span className="app-header__logo">MIX</span>
      <div>
        <h1 className="app-header__title">Video Studio</h1>
        <span className="app-header__project">{title || "無題のプロジェクト"}</span>
      </div>
    </div>

    <div className="app-header__tools">
      <IconBtn icon={Upload} label="素材を読み込む" onClick={onImport} size="sm" />
      <IconBtn icon={Sparkles} label="DAW (.daw)" onClick={onImportDaw} size="sm" className="btn--daw-wrap" />
      <span className="app-header__sep" />
      <IconBtn icon={FolderOpen} label="プロジェクトを開く" onClick={onOpen} size="sm" variant="ghost" />
      <IconBtn icon={Save} label="保存 (.vproj)" onClick={onSave} size="sm" variant="ghost" />
      <div className="export-group">
        <label className="export-group__format">
          <span className="export-group__format-label">形式</span>
          <select
            value={exportFormat}
            disabled={exporting}
            onChange={(e) => onExportFormat(e.target.value as ExportFormat)}
            title={exportFormatHint(exportFormat)}
          >
            <option value="mp4">MP4（YouTube 推奨）</option>
            <option value="webm">WebM</option>
          </select>
        </label>
        <button
          type="button"
          className="btn btn--primary btn--export"
          disabled={exporting}
          onClick={onExport}
          title={exportFormatHint(exportFormat)}
        >
          <Download size={16} />
          {exporting
            ? exportStatus ?? `書き出し ${Math.round(exportPct * 100)}%`
            : "書き出し"}
        </button>
      </div>
    </div>

    <div className="app-header__right">
      <button
        type="button"
        className={`mode-toggle ${mode === "pro" ? "mode-toggle--pro" : ""}`}
        onClick={onToggleMode}
        title={mode === "beginner" ? "詳細モード（やり込み）へ" : "かんたんモードへ"}
      >
        {mode === "beginner" ? (
          <>
            <Sparkles size={14} /> かんたん
          </>
        ) : (
          <>
            <SlidersHorizontal size={14} /> 詳細
          </>
        )}
      </button>
      <IconBtn icon={HelpCircle} label="ヘルプ" onClick={onHelp} variant="ghost" size="sm" />
    </div>
  </header>
);
