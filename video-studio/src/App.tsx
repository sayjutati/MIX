import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { AppHeader } from "./components/AppHeader";
import { AudioMixer } from "./components/AudioMixer";
import { EditToolbar } from "./components/EditToolbar";
import { HelpDialog } from "./components/HelpDialog";
import { InspectorPanel } from "./components/InspectorPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { Timeline } from "./components/Timeline";
import { TransportBar } from "./components/TransportBar";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { ToastStack, type ToastMessage } from "./components/Toast";
import { downloadBlob, exportVideo } from "./export/exportVideo";
import { useEditor } from "./hooks/useEditor";
import { usePlayback } from "./hooks/usePlayback";
import { useUiPrefs } from "./hooks/useUiPrefs";
import { deserializeProject, downloadProject } from "./project";
import { MAX_PX_PER_SEC, MIN_PX_PER_SEC, projectDuration } from "./types";

function App() {
  const editor = useEditor();
  const { state, patch } = editor;
  const { prefs, setMode, patch: patchUi } = useUiPrefs();
  const fileRef = useRef<HTMLInputElement>(null);
  const dawRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playRaf = useRef(0);
  const lastTick = useRef(0);
  const toastId = useRef(0);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportStatus, setExportStatus] = useState<string | undefined>();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((text: string, kind: ToastMessage["kind"] = "info") => {
    const id = `t-${++toastId.current}`;
    setToasts((prev) => [...prev.slice(-4), { id, text, kind }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const placeAsset = useCallback(
    (assetId: string, at?: number) => {
      const result = editor.addClipFromAsset(assetId, undefined, at);
      if (result.ok) pushToast("タイムラインに配置しました", "success");
      else if (result.reason) pushToast(result.reason, "error");
    },
    [editor, pushToast]
  );

  usePlayback(state);

  const isEmpty = state.assets.length === 0 && state.clips.length === 0;
  const isPro = prefs.mode === "pro";

  const tickPlay = useCallback(
    (now: number) => {
      if (!lastTick.current) lastTick.current = now;
      const dt = (now - lastTick.current) / 1000;
      lastTick.current = now;
      let t = state.playhead + dt;
      if (state.loopA != null && state.loopB != null && state.loopB > state.loopA) {
        if (t >= state.loopB) t = state.loopA;
      } else {
        const end = projectDuration(state.clips, state.textClips);
        if (t >= end) t = 0;
      }
      patch({ playhead: t });
      playRaf.current = requestAnimationFrame(tickPlay);
    },
    [state.playhead, state.loopA, state.loopB, state.clips, state.textClips, patch]
  );

  useEffect(() => {
    if (state.isPlaying) {
      lastTick.current = 0;
      playRaf.current = requestAnimationFrame(tickPlay);
    } else {
      cancelAnimationFrame(playRaf.current);
    }
    return () => cancelAnimationFrame(playRaf.current);
  }, [state.isPlaying, tickPlay]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        patchUi({ helpOpen: true });
        return;
      }
      if (prefs.helpOpen && e.key === "Escape") {
        patchUi({ helpOpen: false });
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        patch({ isPlaying: !state.isPlaying });
      }
      if (e.key === "s" || e.key === "S") editor.splitAtPlayhead();
      if (e.key === "m" || e.key === "M") {
        if (state.selectedClipId) editor.toggleClipAudio(state.selectedClipId);
      }
      if (e.key === "Delete" && state.selectedClipId) editor.deleteClip(state.selectedClipId);
      if (e.key === "+" || e.key === "=") {
        patch({ pxPerSec: Math.min(MAX_PX_PER_SEC, state.pxPerSec + 8) });
      }
      if (e.key === "-") {
        patch({ pxPerSec: Math.max(MIN_PX_PER_SEC, state.pxPerSec - 8) });
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        patch({ playhead: Math.max(0, state.playhead - (e.shiftKey ? 1 : 1 / 30)) });
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const end = projectDuration(state.clips, state.textClips);
        patch({ playhead: Math.min(end, state.playhead + (e.shiftKey ? 1 : 1 / 30)) });
      }
      if (e.ctrlKey && e.key === "c") {
        if (editor.copySelectedClip()) pushToast("クリップをコピーしました", "info");
      }
      if (e.ctrlKey && e.key === "v") {
        if (editor.pasteClipboard()) pushToast("クリップを貼り付けました", "success");
        else pushToast("貼り付けるクリップがありません", "error");
      }
      if (e.ctrlKey && e.key === "d") {
        e.preventDefault();
        if (state.selectedClipId) editor.duplicateClip(state.selectedClipId);
      }
      if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        editor.undo();
      }
      if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
        e.preventDefault();
        editor.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, editor, patch, prefs.helpOpen, patchUi, pushToast]);

  useEffect(() => {
    if (!state.selectedClipId) return;
    const isText = state.textClips.some((c) => c.id === state.selectedClipId);
    if (isText && (prefs.inspectorTab === "fx" || prefs.inspectorTab === "project")) {
      patchUi({ inspectorTab: "telop" });
    } else if (!isText && prefs.inspectorTab === "telop") {
      patchUi({ inspectorTab: "basic" });
    } else if (!isText && prefs.inspectorTab === "project") {
      patchUi({ inspectorTab: "basic" });
    }
  }, [state.selectedClipId, state.textClips, prefs.inspectorTab, patchUi]);

  const handleExport = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setExporting(true);
    setExportPct(0);
    setExportStatus(undefined);
    try {
      const { blob, extension } = await exportVideo(
        canvas,
        { ...state, isPlaying: false },
        prefs.exportFormat,
        {
          onProgress: (p, status) => {
            setExportPct(p);
            if (status) setExportStatus(status);
          },
        }
      );
      const base = (state.title || "export").replace(/\.(mp4|webm)$/i, "");
      downloadBlob(blob, `${base}.${extension}`);
      pushToast(`${extension.toUpperCase()} の書き出しが完了しました`, "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "書き出しに失敗しました", "error");
    } finally {
      setExporting(false);
      setExportStatus(undefined);
    }
  };

  if (isEmpty) {
    return (
      <div className="app app--welcome">
        <AppHeader
          title={state.title}
          mode={prefs.mode}
          exporting={exporting}
          exportPct={exportPct}
          exportStatus={exportStatus}
          exportFormat={prefs.exportFormat}
          onExportFormat={(f) => patchUi({ exportFormat: f })}
          onImport={() => fileRef.current?.click()}
          onImportDaw={() => dawRef.current?.click()}
          onOpen={() => projectRef.current?.click()}
          onSave={() => downloadProject(state)}
          onExport={handleExport}
          onToggleMode={() => setMode(isPro ? "beginner" : "pro")}
          onHelp={() => patchUi({ helpOpen: true })}
        />
        <WelcomeScreen
          onImportMedia={() => fileRef.current?.click()}
          onImportDaw={() => dawRef.current?.click()}
          onOpenProject={() => projectRef.current?.click()}
        />
        <FileInputs
          fileRef={fileRef}
          dawRef={dawRef}
          projectRef={projectRef}
          editor={editor}
          onToast={pushToast}
        />
        <HelpDialog open={prefs.helpOpen} onClose={() => patchUi({ helpOpen: false })} />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  return (
    <div className="app">
      <AppHeader
        title={state.title}
        mode={prefs.mode}
        exporting={exporting}
        exportPct={exportPct}
        exportStatus={exportStatus}
        exportFormat={prefs.exportFormat}
        onExportFormat={(f) => patchUi({ exportFormat: f })}
        onImport={() => fileRef.current?.click()}
        onImportDaw={() => dawRef.current?.click()}
        onOpen={() => projectRef.current?.click()}
        onSave={() => downloadProject(state)}
        onExport={handleExport}
        onToggleMode={() => setMode(isPro ? "beginner" : "pro")}
        onHelp={() => patchUi({ helpOpen: true })}
      />

      <FileInputs fileRef={fileRef} dawRef={dawRef} projectRef={projectRef} editor={editor} onToast={pushToast} />

      <TransportBar
        state={state}
        onPlay={() => patch({ isPlaying: !state.isPlaying })}
        onStop={() => patch({ isPlaying: false, playhead: 0 })}
        onSeek={(t) => patch({ playhead: t })}
        onSetLoop={(which) => {
          if (which === "A") patch({ loopA: state.playhead });
          else patch({ loopB: state.playhead });
        }}
        onClearLoop={() => patch({ loopA: null, loopB: null })}
        onMasterVolume={(v) => patch({ masterVolume: v })}
        onToggleAudio={() => patch({ audioEnabled: !state.audioEnabled })}
      />

      <EditToolbar state={state} editor={editor} isPro={isPro} />

      <AudioMixer
        state={state}
        editor={editor}
        open={prefs.mixerOpen}
        compact={!isPro}
        onToggleOpen={() => patchUi({ mixerOpen: !prefs.mixerOpen })}
      />

      <div className="workspace">
        <Sidebar
          state={state}
          tab={prefs.sidebarTab}
          isPro={isPro}
          onTab={(t) => patchUi({ sidebarTab: t })}
          onImport={() => fileRef.current?.click()}
          onImportDaw={() => dawRef.current?.click()}
          onAddToTimeline={placeAsset}
          onAddTelop={(id) => {
            editor.addTelopFromPreset(id);
            pushToast("テロップを追加しました", "success");
          }}
        />
        <div className="workspace__center">
          <PreviewPanel
            state={state}
            editor={editor}
            onCanvasReady={(c) => {
              canvasRef.current = c;
            }}
          />
        </div>
        <InspectorPanel
          state={state}
          editor={editor}
          tab={prefs.inspectorTab}
          onTab={(t) => patchUi({ inspectorTab: t })}
          isPro={isPro}
          exportFormat={prefs.exportFormat}
          onExportFormat={(f) => patchUi({ exportFormat: f })}
        />
      </div>

      <Timeline
        state={state}
        editor={editor}
        onPlacementFailed={(reason) => pushToast(reason, "error")}
      />
      <StatusBar state={state} mode={prefs.mode} />
      <HelpDialog open={prefs.helpOpen} onClose={() => patchUi({ helpOpen: false })} />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function FileInputs({
  fileRef,
  dawRef,
  projectRef,
  editor,
  onToast,
}: {
  fileRef: React.RefObject<HTMLInputElement | null>;
  dawRef: React.RefObject<HTMLInputElement | null>;
  projectRef: React.RefObject<HTMLInputElement | null>;
  editor: ReturnType<typeof useEditor>;
  onToast: (text: string, kind?: ToastMessage["kind"]) => void;
}) {
  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="video/*,audio/*,image/*"
        multiple
        hidden
        onChange={async (e) => {
          if (e.target.files) {
            const { added, failed } = await editor.importFiles(e.target.files);
            if (added) onToast(`${added} 件の素材を追加しました`, "success");
            if (failed.length) onToast(`${failed.length} 件を読み込めませんでした`, "error");
            if (!added && !failed.length) onToast("追加できるファイルがありませんでした", "error");
          }
          e.target.value = "";
        }}
      />
      <input
        ref={dawRef}
        type="file"
        accept=".daw,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) {
            try {
              await editor.importDaw(f);
              onToast("DAW ミックスを読み込みました", "success");
            } catch {
              onToast("DAW ファイルの読み込みに失敗しました", "error");
            }
          }
          e.target.value = "";
        }}
      />
      <input
        ref={projectRef}
        type="file"
        accept=".vproj,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            editor.loadState(deserializeProject(JSON.parse(await f.text())));
            onToast("プロジェクトを開きました", "success");
          } catch {
            onToast("プロジェクトの読み込みに失敗しました", "error");
          }
          e.target.value = "";
        }}
      />
    </>
  );
}

export default App;
