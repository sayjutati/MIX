import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "./components/AppHeader";
import { AdjustPanel } from "./components/AdjustPanel";
import { CanvasViewport } from "./components/CanvasViewport";
import { ExportPanel } from "./components/ExportPanel";
import { GeneratePanel } from "./components/GeneratePanel";
import { LayerPanel } from "./components/LayerPanel";
import { ToolSidebar } from "./components/ToolSidebar";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { downloadBlob } from "./canvas/layerRenderer";
import { deserializeProject, downloadProject } from "./storage/projectStorage";
import { usePhotoStore } from "./state/usePhotoStore";
import type { ExportFormat, ExportOptions } from "./types/document";
import "./App.css";

const modKey = (e: KeyboardEvent | React.KeyboardEvent) => e.ctrlKey || e.metaKey;

export default function App() {
  const project = usePhotoStore((s) => s.project);
  const activeTab = usePhotoStore((s) => s.activeTab);
  const hist = usePhotoStore((s) => s.hist);
  const patch = usePhotoStore((s) => s.patch);
  const newProject = usePhotoStore((s) => s.newProject);
  const loadProject = usePhotoStore((s) => s.loadProject);
  const importFile = usePhotoStore((s) => s.importFile);
  const undo = usePhotoStore((s) => s.undo);
  const redo = usePhotoStore((s) => s.redo);
  const exportImage = usePhotoStore((s) => s.exportImage);
  const setProjectName = usePhotoStore((s) => s.setProjectName);

  const fileRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  const showWelcome = project.layers.length === 0 && !workspaceOpen;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (modKey(e) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (modKey(e) && (e.key === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        redo();
      }
      if (modKey(e) && e.key === "o") {
        e.preventDefault();
        fileRef.current?.click();
      }
      if (modKey(e) && e.key === "s") {
        e.preventDefault();
        downloadProject(project);
        showToast("プロジェクトを保存しました");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, project, showToast]);

  const handleExport = async (format: ExportFormat, options?: ExportOptions) => {
    if (project.layers.length === 0) {
      showToast("書き出すレイヤーがありません");
      return;
    }
    setExporting(true);
    try {
      const blob = await exportImage(format, options);
      const base = (project.name || "export").replace(/\.(png|jpe?g|webp)$/i, "");
      downloadBlob(blob, `${base}.${format === "jpeg" ? "jpg" : format}`);
      showToast(`${format.toUpperCase()} を書き出しました`);
    } catch {
      showToast("書き出しに失敗しました");
    } finally {
      setExporting(false);
    }
  };

  const handleImportFiles = async (files: File[]) => {
    for (const f of files) {
      try {
        await importFile(f);
        setWorkspaceOpen(true);
      } catch {
        showToast(`${f.name} を読み込めませんでした`);
      }
    }
  };

  const startWorkspace = (w?: number, h?: number) => {
    newProject(w ?? 1920, h ?? 1080);
    setWorkspaceOpen(true);
    patch({ activeTab: "generate" });
  };

  return (
    <div className="app">
      <AppHeader
        title={project.name}
        canUndo={hist.undo.length > 0}
        canRedo={hist.redo.length > 0}
        exporting={exporting}
        onImport={() => fileRef.current?.click()}
        onSave={() => {
          downloadProject(project);
          showToast("プロジェクトを保存しました");
        }}
        onOpen={() => projectRef.current?.click()}
        onExport={(f) => void handleExport(f)}
        onUndo={undo}
        onRedo={redo}
        onRename={setProjectName}
        onHelp={() =>
          showToast("Space+ドラッグ: パン · Ctrl+ホイール: ズーム · クリック: レイヤー選択")
        }
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = e.target.files;
          if (files) void handleImportFiles(Array.from(files));
          e.target.value = "";
        }}
      />
      <input
        ref={projectRef}
        type="file"
        accept=".pphoto,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const parsed = JSON.parse(await f.text()) as Parameters<typeof deserializeProject>[0];
            const missing = await loadProject(deserializeProject(parsed));
            setWorkspaceOpen(true);
            if (missing.length) {
              showToast(`開きました（${missing.length} レイヤーの画像が見つかりません）`);
            } else {
              showToast("プロジェクトを開きました");
            }
          } catch {
            showToast("プロジェクトの読み込みに失敗しました");
          }
          e.target.value = "";
        }}
      />

      {showWelcome ? (
        <WelcomeScreen
          onNew={startWorkspace}
          onImport={() => fileRef.current?.click()}
          onStartGenerate={() => startWorkspace()}
        />
      ) : (
        <div className="workspace">
          <ToolSidebar active={activeTab === "layers" ? "adjust" : activeTab} onChange={(t) => patch({ activeTab: t })} />
          <aside className="workspace__layers">
            <LayerPanel />
          </aside>
          <main className="workspace__main">
            <CanvasViewport onDropFiles={(files) => void handleImportFiles(files)} />
          </main>
          <aside className="workspace__panel">
            {activeTab === "generate" && <GeneratePanel onError={showToast} />}
            {(activeTab === "adjust" || activeTab === "layers") && <AdjustPanel />}
            {activeTab === "export" && (
              <ExportPanel exporting={exporting} onExport={(f, o) => void handleExport(f, o)} />
            )}
          </aside>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
