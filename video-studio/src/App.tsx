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
import { putHandoff, takeHandoff } from "./handoff";
import { renderFrameAsync } from "./preview/compositor";
import { studioHref } from "./studioNav";
import { MAX_PX_PER_SEC, MIN_PX_PER_SEC, projectDuration } from "./types";

function App() {
  const editor = useEditor();
  const { state, patch } = editor;
  const { prefs, setMode, patch: patchUi } = useUiPrefs();
  const fileRef = useRef<HTMLInputElement>(null);
  const dawRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);
  const captionRef = useRef<HTMLInputElement>(null);
  const playRaf = useRef(0);
  const lastTick = useRef(0);
  const toastId = useRef(0);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportStatus, setExportStatus] = useState<string | undefined>();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [sendingFrame, setSendingFrame] = useState(false);
  const [voiceRec, setVoiceRec] = useState<MediaRecorder | null>(null);
  const handoffTried = useRef(false);

  useEffect(() => {
    if (handoffTried.current) return;
    handoffTried.current = true;
    void (async () => {
      try {
        const mix = await takeHandoff("daw-mix");
        if (mix) {
          const file = new File([mix.blob], mix.name || "DAWミックス.wav", {
            type: mix.blob.type || "audio/wav",
          });
          await editor.importAudioOntoTrack(file, "a2", "daw");
          pushToast("DAW ミックスを取り込みました", "success");
        }
        const overlay = await takeHandoff("photo-overlay");
        if (overlay) {
          const file = new File([overlay.blob], overlay.name || "thumb.png", {
            type: overlay.blob.type || "image/png",
          });
          await editor.importImageOntoOverlay(file);
          pushToast("Photo の画像をオーバーレイに置きました", "success");
        }
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "受け渡しの取り込みに失敗しました", "error");
      }
    })();
    // 起動時一度だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // タブが裏に回って rAF が止まった後に再生位置が飛ばないよう上限を設ける
      const dt = Math.min(0.1, (now - lastTick.current) / 1000);
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
      if (exporting) return;
      const el = e.target;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
      // Shift / CapsLock で e.key が大文字になるので小文字に揃える
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const mod = e.ctrlKey || e.metaKey;

      if (mod) {
        if (key === "c") {
          if (editor.copySelectedClip()) pushToast("クリップをコピーしました", "info");
        } else if (key === "v") {
          if (editor.pasteClipboard()) pushToast("クリップを貼り付けました", "success");
          else pushToast("貼り付けるクリップがありません", "error");
        } else if (key === "d") {
          e.preventDefault();
          if (state.selectedClipId) editor.duplicateClip(state.selectedClipId);
        } else if (key === "z" && !e.shiftKey) {
          e.preventDefault();
          editor.undo();
        } else if (key === "y" || (key === "z" && e.shiftKey)) {
          e.preventDefault();
          editor.redo();
        }
        // Ctrl+S（ブラウザ保存）・Ctrl+M・Ctrl+= など、他の組み合わせはブラウザに任せる
        return;
      }
      if (e.altKey) return;

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
      if (key === "s") editor.splitAtPlayhead();
      if (key === "m") {
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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, editor, patch, prefs.helpOpen, patchUi, pushToast, exporting]);

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
    if (exporting) return;
    // プレビュー用 canvas とは別に描く（書き出し中の編集・再描画でフレームが壊れないように）
    const canvas = document.createElement("canvas");
    canvas.width = state.previewWidth;
    canvas.height = state.previewHeight;
    setExporting(true);
    setExportPct(0);
    setExportStatus(undefined);
    patch({ isPlaying: false });
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

  const sendFrameToPhoto = async () => {
    if (sendingFrame) return;
    const win = window.open("about:blank", "_blank");
    setSendingFrame(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = state.previewWidth;
      canvas.height = state.previewHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas 2d unavailable");
      await renderFrameAsync(ctx, { ...state, isPlaying: false }, state.playhead);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("フレームの書き出しに失敗しました"))), "image/png");
      });
      await putHandoff("video-frame", `${state.title || "frame"}.png`, blob);
      const url = studioHref("photo");
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (err) {
      win?.close();
      pushToast(err instanceof Error ? err.message : "Photo への送信に失敗しました", "error");
    } finally {
      setSendingFrame(false);
    }
  };

  const toggleVoiceover = async () => {
    if (voiceRec && voiceRec.state !== "inactive") {
      voiceRec.stop();
      setVoiceRec(null);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 200) {
          pushToast("ナレーションが短すぎます", "error");
          return;
        }
        const file = new File([blob], "voiceover.webm", { type: blob.type });
        void editor.importAudioOntoTrack(file, "a1", "media").then(() => {
          pushToast("ナレーションを Audio 1 に置きました", "success");
        });
      };
      rec.start(250);
      setVoiceRec(rec);
      pushToast("ナレーション録音中… もう一度押すと停止", "info");
    } catch {
      pushToast("マイクを使えませんでした", "error");
    }
  };

  const applyCaptionFile = async (file: File) => {
    try {
      const n = editor.importCaptions(await file.text());
      pushToast(`${n} 件の歌詞／字幕を追加しました`, "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "字幕の読み込みに失敗しました", "error");
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
          onImportCaptions={() => captionRef.current?.click()}
          onSendFrame={() => void sendFrameToPhoto()}
          sendingFrame={sendingFrame}
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
          captionRef={captionRef}
          editor={editor}
          onToast={pushToast}
          onCaptionFile={(f) => void applyCaptionFile(f)}
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
        onImportCaptions={() => captionRef.current?.click()}
        onSendFrame={() => void sendFrameToPhoto()}
        sendingFrame={sendingFrame}
        onOpen={() => projectRef.current?.click()}
        onSave={() => downloadProject(state)}
        onExport={handleExport}
        onToggleMode={() => setMode(isPro ? "beginner" : "pro")}
        onHelp={() => patchUi({ helpOpen: true })}
      />

      <FileInputs
        fileRef={fileRef}
        dawRef={dawRef}
        projectRef={projectRef}
        captionRef={captionRef}
        editor={editor}
        onToast={pushToast}
        onCaptionFile={(f) => void applyCaptionFile(f)}
      />

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
        onVoiceover={() => void toggleVoiceover()}
        voiceoverActive={!!voiceRec}
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
          onImportCaptions={() => captionRef.current?.click()}
          onAddToTimeline={placeAsset}
          onAddTelop={(id) => {
            editor.addTelopFromPreset(id);
            pushToast("テロップを追加しました", "success");
          }}
        />
        <div className="workspace__center">
          <PreviewPanel state={state} editor={editor} />
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
  captionRef,
  editor,
  onToast,
  onCaptionFile,
}: {
  fileRef: React.RefObject<HTMLInputElement | null>;
  dawRef: React.RefObject<HTMLInputElement | null>;
  projectRef: React.RefObject<HTMLInputElement | null>;
  captionRef: React.RefObject<HTMLInputElement | null>;
  editor: ReturnType<typeof useEditor>;
  onToast: (text: string, kind?: ToastMessage["kind"]) => void;
  onCaptionFile: (file: File) => void;
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
            } catch (err) {
              const known = err instanceof Error && !(err instanceof SyntaxError);
              onToast(known ? err.message : "DAW ファイルの読み込みに失敗しました", "error");
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
      <input
        ref={captionRef}
        type="file"
        accept=".srt,.vtt,.lrc,.txt,text/plain,application/x-subrip"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onCaptionFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

export default App;
