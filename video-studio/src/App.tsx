import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { AudioMixer } from "./components/AudioMixer";
import { InspectorPanel } from "./components/InspectorPanel";
import { MediaLibrary } from "./components/MediaLibrary";
import { PreviewPanel } from "./components/PreviewPanel";
import { Timeline } from "./components/Timeline";
import { TransportBar } from "./components/TransportBar";
import { downloadBlob, exportToWebM } from "./export/exportVideo";
import { useEditor } from "./hooks/useEditor";
import { usePlayback } from "./hooks/usePlayback";
import { deserializeProject, downloadProject } from "./project";
import { MAX_PX_PER_SEC, MIN_PX_PER_SEC, projectDuration } from "./types";

function App() {
  const editor = useEditor();
  const { state, patch } = editor;
  const fileRef = useRef<HTMLInputElement>(null);
  const dawRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playRaf = useRef(0);
  const lastTick = useRef(0);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);

  usePlayback(state);

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
      if (e.code === "Space") {
        e.preventDefault();
        patch({ isPlaying: !state.isPlaying });
      }
      if (e.key === "s" || e.key === "S") editor.splitAtPlayhead();
      if (e.key === "+" || e.key === "=") patch({ pxPerSec: Math.min(MAX_PX_PER_SEC, state.pxPerSec + 8) });
      if (e.key === "-") patch({ pxPerSec: Math.max(MIN_PX_PER_SEC, state.pxPerSec - 8) });
      if (e.key === "Delete" && state.selectedClipId) editor.deleteClip(state.selectedClipId);
      if ((e.key === "m" || e.key === "M") && state.selectedClipId) {
        editor.toggleClipAudio(state.selectedClipId);
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
  }, [state, editor, patch]);

  const handleAddAsset = (assetId: string) => {
    editor.addClipFromAsset(assetId);
  };

  const handleExport = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setExporting(true);
    setExportPct(0);
    try {
      const blob = await exportToWebM(canvas, { ...state, isPlaying: false }, {
        onProgress: setExportPct,
      });
      downloadBlob(blob, `${state.title || "export"}.webm`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "書き出しに失敗しました");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="app">
      <header className="app__header">
        <h1>MIX Video Studio</h1>
        <div className="app__actions">
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            インポート
          </button>
          <button type="button" className="btn" onClick={() => projectRef.current?.click()}>
            開く
          </button>
          <button type="button" className="btn" onClick={() => downloadProject(state)}>
            保存
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={exporting}
            onClick={handleExport}
          >
            {exporting ? `書き出し ${Math.round(exportPct * 100)}%` : "書き出し WebM"}
          </button>
        </div>
      </header>

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
            const file = JSON.parse(await f.text());
            editor.loadState(deserializeProject(file));
          } catch {
            alert("プロジェクトの読み込みに失敗しました");
          }
          e.target.value = "";
        }}
      />

      <TransportBar
        state={state}
        onPlay={() => patch({ isPlaying: !state.isPlaying })}
        onStop={() => patch({ isPlaying: false, playhead: 0 })}
        onSeek={(t) => patch({ playhead: t })}
        onZoom={(d) =>
          patch({
            pxPerSec: Math.min(MAX_PX_PER_SEC, Math.max(MIN_PX_PER_SEC, state.pxPerSec + d)),
          })
        }
        onSetLoop={(which) => {
          if (which === "A") patch({ loopA: state.playhead });
          else patch({ loopB: state.playhead });
        }}
        onClearLoop={() => patch({ loopA: null, loopB: null })}
        onMasterVolume={(v) => patch({ masterVolume: v })}
        onToggleAudio={() => patch({ audioEnabled: !state.audioEnabled })}
      />

      <AudioMixer state={state} editor={editor} />

      <div className="app__main">
        <MediaLibrary
          state={state}
          onImport={() => fileRef.current?.click()}
          onImportDaw={() => dawRef.current?.click()}
          onAddToTimeline={handleAddAsset}
        />
        <PreviewPanel state={state} onCanvasReady={(c) => { canvasRef.current = c; }} />
        <InspectorPanel state={state} editor={editor} />
      </div>

      <Timeline state={state} editor={editor} />
    </div>
  );
}

export default App;
