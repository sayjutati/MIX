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
import { downloadBlob, exportVideo } from "./export/exportVideo";
import { useEditor } from "./hooks/useEditor";
import { usePlayback } from "./hooks/usePlayback";
import { useUiPrefs } from "./hooks/useUiPrefs";
import { deserializeProject, downloadProject } from "./project";
import { projectDuration } from "./types";

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
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportStatus, setExportStatus] = useState<string | undefined>();

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
  }, [state, editor, patch, prefs.helpOpen, patchUi]);

  useEffect(() => {
    if (state.selectedClipId && prefs.inspectorTab === "project") {
      patchUi({ inspectorTab: "basic" });
    }
  }, [state.selectedClipId, prefs.inspectorTab, patchUi]);

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
    } catch (err) {
      alert(err instanceof Error ? err.message : "書き出しに失敗しました");
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
        />
        <HelpDialog open={prefs.helpOpen} onClose={() => patchUi({ helpOpen: false })} />
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

      <FileInputs fileRef={fileRef} dawRef={dawRef} projectRef={projectRef} editor={editor} />

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
          onAddToTimeline={(id) => editor.addClipFromAsset(id)}
        />
        <div className="workspace__center">
          <PreviewPanel
            state={state}
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

      <Timeline state={state} editor={editor} />
      <StatusBar state={state} mode={prefs.mode} />
      <HelpDialog open={prefs.helpOpen} onClose={() => patchUi({ helpOpen: false })} />
    </div>
  );
}

function FileInputs({
  fileRef,
  dawRef,
  projectRef,
  editor,
}: {
  fileRef: React.RefObject<HTMLInputElement | null>;
  dawRef: React.RefObject<HTMLInputElement | null>;
  projectRef: React.RefObject<HTMLInputElement | null>;
  editor: ReturnType<typeof useEditor>;
}) {
  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="video/*,audio/*,image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void editor.importFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={dawRef}
        type="file"
        accept=".daw,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void editor.importDaw(f);
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
          } catch {
            alert("プロジェクトの読み込みに失敗しました");
          }
          e.target.value = "";
        }}
      />
    </>
  );
}

export default App;
