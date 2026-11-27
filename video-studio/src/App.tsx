import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { playbackEngine } from "./audio/playbackEngine";
import { AppHeader } from "./components/AppHeader";
import { HelpDialog } from "./components/HelpDialog";
import { InspectorPanel } from "./components/InspectorPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { Timeline } from "./components/Timeline";
import { ToastStack, type ToastMessage } from "./components/Toast";
import { TransportBar } from "./components/TransportBar";
import { downloadBlob, exportVideo } from "./export/exportVideo";
import { putHandoff, subscribeHandoff, takeHandoff } from "./handoff";
import { useEditor } from "./hooks/useEditor";
import { usePlayback } from "./hooks/usePlayback";
import { useUiPrefs } from "./hooks/useUiPrefs";
import { pauseAllPreviewVideos, renderFrameAsync } from "./preview/compositor";
import { deserializeProject, downloadProject } from "./project";
import { studioHref } from "./studioNav";
import { DEFAULT_FPS, MAX_PX_PER_SEC, MIN_PX_PER_SEC, projectDuration } from "./types";

function App() {
  const editor = useEditor();
  const { state, patch } = editor;
  const { prefs, patch: patchUi } = useUiPrefs();

  const fileRef = useRef<HTMLInputElement>(null);
  const dawRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);
  const captionRef = useRef<HTMLInputElement>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const playAnchorRef = useRef<{ wallMs: number; startPlayhead: number } | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const toastId = useRef(0);
  const handoffTried = useRef(false);

  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportStatus, setExportStatus] = useState<string | undefined>();
  const [statusMsg, setStatusMsg] = useState<string | undefined>();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [sendingFrame, setSendingFrame] = useState(false);

  const pushToast = useCallback((text: string, kind: ToastMessage["kind"] = "info") => {
    const id = `t-${++toastId.current}`;
    setToasts((prev) => [...prev.slice(-4), { id, text, kind }]);
    setStatusMsg(text);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handoffBusy = useRef(false);
  const consumeIncomingHandoffs = useCallback(async () => {
    if (handoffBusy.current) return;
    handoffBusy.current = true;
    try {
      const mix = await takeHandoff("daw-mix");
      if (mix) {
        const file = new File([mix.blob], mix.name || "DAWミックス.wav", {
          type: mix.blob.type || "audio/wav",
        });
        await editor.importAudioOntoTrack(file, "a2", "daw", 0, "DAW ミックス");
        pushToast("DAW ミックスを 0:00 に同期配置しました", "success");
      }
      const dtm = await takeHandoff("dtm-video");
      if (dtm) {
        const file = new File([dtm.blob], dtm.name || "DTM伴奏.wav", {
          type: dtm.blob.type || "audio/wav",
        });
        await editor.importAudioOntoTrack(file, "a2", "daw", 0, "DTM 伴奏");
        pushToast("DTM の伴奏を 0:00 に同期配置しました", "success");
      }
      const overlay = await takeHandoff("photo-overlay");
      if (overlay) {
        const file = new File([overlay.blob], overlay.name || "thumb.png", {
          type: overlay.blob.type || "image/png",
        });
        await editor.importImageOntoOverlay(file, true);
        pushToast("Photo の画像をオーバーレイに配置しました", "success");
      }
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : "受け渡しの取り込みに失敗しました",
        "error"
      );
    } finally {
      handoffBusy.current = false;
    }
  }, [editor, pushToast]);

  // DAW / DTM / Photo Studio からのハンドオフ自動取込（起動時 + 既存タブ復帰・通知時）
  useEffect(() => {
    if (!handoffTried.current) {
      handoffTried.current = true;
      void consumeIncomingHandoffs();
    }
    return subscribeHandoff(["daw-mix", "dtm-video", "photo-overlay"], () => {
      void consumeIncomingHandoffs();
    });
  }, [consumeIncomingHandoffs]);

  usePlayback(state);

  // 高精度クロック同期再生ループ（毎フレームの useEffect 再起動バグを根絶）
  useEffect(() => {
    if (!state.isPlaying) {
      playAnchorRef.current = null;
      pauseAllPreviewVideos();
      return;
    }

    playAnchorRef.current = {
      wallMs: performance.now(),
      startPlayhead: stateRef.current.playhead,
    };

    let raf = 0;
    const tick = (now: number) => {
      const cur = stateRef.current;
      if (!cur.isPlaying) return;
      const anchor = playAnchorRef.current ?? { wallMs: now, startPlayhead: cur.playhead };
      let t = anchor.startPlayhead + Math.max(0, (now - anchor.wallMs) / 1000);

      if (cur.loopA != null && cur.loopB != null && cur.loopB > cur.loopA) {
        if (t >= cur.loopB) {
          t = cur.loopA;
          playAnchorRef.current = { wallMs: now, startPlayhead: t };
        }
      } else {
        const end = projectDuration(cur.clips, cur.textClips);
        if (t >= end) {
          patch({ playhead: end, isPlaying: false });
          return;
        }
      }

      patch({ playhead: t });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.isPlaying, patch]);

  const seekTo = useCallback(
    (rawTime: number) => {
      const cur = stateRef.current;
      const t = Math.max(0, rawTime);
      if (cur.isPlaying) {
        playAnchorRef.current = { wallMs: performance.now(), startPlayhead: t };
      } else {
        playbackEngine.scrubPreview(cur, t);
      }
      patch({ playhead: t });
    },
    [patch]
  );

  const togglePlay = useCallback(() => {
    const cur = stateRef.current;
    if (cur.isPlaying) {
      patch({ isPlaying: false });
      return;
    }
    const end = projectDuration(cur.clips, cur.textClips);
    const nextStart = cur.playhead >= end - 0.02 ? 0 : cur.playhead;
    playAnchorRef.current = { wallMs: performance.now(), startPlayhead: nextStart };
    patch({ playhead: nextStart, isPlaying: true });
  }, [patch]);

  // クリップ選択変更時に適切なインスペクタタブへ自動スイッチ
  useEffect(() => {
    if (!state.selectedClipId) return;
    const isText = state.textClips.some((c) => c.id === state.selectedClipId);
    if (isText && prefs.inspectorTab !== "telop") {
      patchUi({ inspectorTab: "telop" });
    } else if (!isText && prefs.inspectorTab === "telop") {
      patchUi({ inspectorTab: "basic" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedClipId]);

  // キーボードショートカット
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

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const mod = e.ctrlKey || e.metaKey;

      if (mod) {
        if (key === "c") {
          if (editor.copySelectedClip()) pushToast("クリップをコピーしました", "info");
        } else if (key === "v") {
          // window paste イベントで外部画像/ファイル・内部クリップを一括処理する
          return;
        } else if (key === "d") {
          e.preventDefault();
          editor.duplicateSelected();
        } else if (key === "b") {
          e.preventDefault();
          editor.splitAtPlayhead();
        } else if (key === "z" && !e.shiftKey) {
          e.preventDefault();
          editor.undo();
        } else if (key === "y" || (key === "z" && e.shiftKey)) {
          e.preventDefault();
          editor.redo();
        }
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

      if (e.code === "Space" || key === "k") {
        e.preventDefault();
        togglePlay();
        return;
      }
      if (key === "s") {
        editor.splitAtPlayhead();
        return;
      }
      if (e.key === "[") {
        editor.trimToPlayhead("start");
        return;
      }
      if (e.key === "]") {
        editor.trimToPlayhead("end");
        return;
      }
      if (key === "m" && state.selectedClipId) {
        editor.toggleClipAudio(state.selectedClipId);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && state.selectedClipId) {
        e.preventDefault();
        editor.deleteClip(state.selectedClipId, e.shiftKey);
        return;
      }
      if (e.key === "+" || e.key === "=") {
        patch({ pxPerSec: Math.min(MAX_PX_PER_SEC, Math.round(state.pxPerSec * 1.2)) });
        return;
      }
      if (e.key === "-") {
        patch({ pxPerSec: Math.max(MIN_PX_PER_SEC, Math.round(state.pxPerSec / 1.2)) });
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        seekTo(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        seekTo(projectDuration(state.clips, state.textClips));
        return;
      }
      const fps = state.fps ?? DEFAULT_FPS;
      if (e.key === "ArrowLeft" || key === "j") {
        e.preventDefault();
        seekTo(Math.max(0, state.playhead - (e.shiftKey ? 1 : 1 / fps)));
      } else if (e.key === "ArrowRight" || key === "l") {
        e.preventDefault();
        const end = projectDuration(state.clips, state.textClips);
        seekTo(Math.min(end, state.playhead + (e.shiftKey ? 1 : 1 / fps)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, editor, patch, prefs.helpOpen, patchUi, pushToast, exporting, togglePlay, seekTo]);

  const applyCaptionFile = useCallback(
    async (file: File) => {
      try {
        const n = editor.importCaptions(await file.text());
        pushToast(`${n} 件の歌詞・字幕を配置しました`, "success");
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "字幕の読み込みに失敗しました", "error");
      }
    },
    [editor, pushToast]
  );

  const importDawWithFeedback = useCallback(
    async (file: File) => {
      try {
        const info = await editor.importDaw(file);
        const fxNote = info.hasUnbakedFx
          ? "（※リバーブやピッチ補正込みの音は DAW の「動画へ送る」推奨）"
          : "";
        pushToast(
          `DAW から ${info.trackCount} トラック（${info.clipCount} クリップ）を取り込みました${fxNote}`,
          "success"
        );
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "DAW ファイルの読み込みに失敗しました", "error");
      }
    },
    [editor, pushToast]
  );

  // PC フォルダ・他スタジオからのファイルドロップ統合処理（メディア / 字幕 / DAW / Photo / プロジェクト全対応）
  const handleExternalFiles = useCallback(
    async (files: FileList | File[], targetTrackId?: string, startSec?: number) => {
      const mediaList: File[] = [];
      for (const f of Array.from(files)) {
        const lower = f.name.toLowerCase();
        if (lower.endsWith(".vproj")) {
          try {
            editor.loadState(deserializeProject(JSON.parse((await f.text()).replace(/^\uFEFF/, ""))));
            pushToast("プロジェクトを開きました", "success");
          } catch {
            pushToast("プロジェクトの読み込みに失敗しました", "error");
          }
          continue;
        }
        if (lower.endsWith(".daw")) {
          await importDawWithFeedback(f);
          continue;
        }
        if (lower.endsWith(".pphoto")) {
          try {
            await editor.importPPhoto(f);
            pushToast("Photo プロジェクト (.pphoto) を合成して配置しました", "success");
          } catch (err) {
            pushToast(err instanceof Error ? err.message : ".pphoto の読み込みに失敗しました", "error");
          }
          continue;
        }
        if (lower.endsWith(".json")) {
          try {
            const raw = (await f.text()).replace(/^\uFEFF/, "");
            const json = JSON.parse(raw) as Record<string, unknown> | null;
            if (json && typeof json === "object") {
              if ("project" in json && typeof json.project === "object" && json.project !== null) {
                await editor.importPPhoto(f);
                pushToast("Photo プロジェクトを合成して配置しました", "success");
                continue;
              }
              if (Array.isArray(json.tracks) && "textClips" in json) {
                editor.loadState(deserializeProject(json as unknown as Parameters<typeof deserializeProject>[0]));
                pushToast("プロジェクトを開きました", "success");
                continue;
              }
              if (Array.isArray(json.tracks) && "tempo" in json) {
                pushToast(
                  "DTM プロジェクトは DTM Studio の「動画へ」ボタンまたは WAV 書き出しで取り込めます",
                  "info"
                );
                continue;
              }
              if (Array.isArray(json.tracks)) {
                await importDawWithFeedback(f);
                continue;
              }
            }
          } catch {
            pushToast("JSON ファイルの形式を判別できませんでした", "error");
            continue;
          }
        }
        if (/\.(mid|midi)$/i.test(lower)) {
          pushToast(
            "MIDI ファイルは DTM Studio で読み込んで「動画へ」送ると伴奏音声として配置できます",
            "info"
          );
          continue;
        }
        if (/\.(srt|vtt|lrc|txt)$/i.test(lower)) {
          await applyCaptionFile(f);
          continue;
        }
        mediaList.push(f);
      }

      if (mediaList.length > 0) {
        const { added, failed } = await editor.importFiles(mediaList, {
          autoPlace: true,
          targetTrackId,
          startAt: startSec,
        });
        if (added > 0) pushToast(`${added} 件の素材をタイムラインに配置しました`, "success");
        if (failed.length > 0) pushToast(`${failed.length} 件を読み込めませんでした`, "error");
      }
    },
    [editor, pushToast, applyCaptionFile, importDawWithFeedback]
  );

  // OS クリップボードからの直接貼り付け（スクショ画像・メディアファイル・字幕テキスト・内部クリップ）
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
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

      const dt = e.clipboardData;
      if (dt && dt.files && dt.files.length > 0) {
        e.preventDefault();
        void handleExternalFiles(dt.files);
        return;
      }

      if (editor.pasteClipboard()) {
        e.preventDefault();
        pushToast("再生位置へ貼り付けました", "success");
        return;
      }

      const plain = dt?.getData("text/plain")?.trim();
      if (plain) {
        e.preventDefault();
        try {
          if (plain.includes("-->") || /\[\d+:\d{1,2}/.test(plain) || plain.includes("\n")) {
            const count = editor.importCaptions(plain);
            pushToast(`クリップボードから ${count} 件の歌詞・字幕を配置しました`, "success");
          } else {
            editor.addTextClip();
            // 直後に追加された選択テロップへテキストを反映
            setTimeout(() => {
              const id = stateRef.current.selectedClipId;
              if (id) editor.updateClip(id, { text: plain });
            }, 0);
            pushToast("クリップボードのテキストをテロップとして追加しました", "success");
          }
        } catch {
          pushToast("テキストの貼り付けに失敗しました", "error");
        }
        return;
      }

      pushToast("貼り付けるクリップや画像がありません", "error");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [exporting, editor, handleExternalFiles, pushToast]);

  const placeAsset = useCallback(
    (assetId: string, at?: number) => {
      const result = editor.addClipFromAsset(assetId, undefined, at);
      if (result.ok) pushToast("タイムラインに配置しました", "success");
      else if (result.reason) pushToast(result.reason, "error");
    },
    [editor, pushToast]
  );

  const handleExport = async () => {
    if (exporting) return;
    if (state.clips.length === 0 && state.textClips.length === 0) {
      pushToast("書き出すクリップまたはテロップがありません", "error");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = state.previewWidth;
    canvas.height = state.previewHeight;
    const ac = new AbortController();
    exportAbortRef.current = ac;

    setExporting(true);
    setExportPct(0);
    setExportStatus("書き出し準備中…");
    patch({ isPlaying: false });

    try {
      const { blob, extension } = await exportVideo(
        canvas,
        { ...state, isPlaying: false },
        prefs.exportFormat,
        {
          signal: ac.signal,
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
      if ((err as Error)?.name === "AbortError") {
        pushToast("書き出しを中止しました", "info");
      } else {
        pushToast(err instanceof Error ? err.message : "書き出しに失敗しました", "error");
      }
    } finally {
      exportAbortRef.current = null;
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
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("フレーム画像の生成に失敗しました"))),
          "image/png"
        );
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

  return (
    <div
      className="app"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
        }
      }}
      onDrop={(e) => {
        if (e.defaultPrevented) return;
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          e.preventDefault();
          void handleExternalFiles(e.dataTransfer.files);
        }
      }}
    >
      <AppHeader
        title={state.title}
        onTitleChange={(next) => patch({ title: next })}
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
        onExport={() => void handleExport()}
        onCancelExport={() => exportAbortRef.current?.abort()}
        onHelp={() => patchUi({ helpOpen: true })}
      />

      {/* 隠しファイル入力 */}
      <input
        ref={fileRef}
        type="file"
        accept="video/*,audio/*,image/*,.daw,.pphoto,.vproj,.srt,.vtt,.lrc,.txt"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void handleExternalFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={dawRef}
        type="file"
        accept=".daw,.pphoto,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) {
            if (f.name.toLowerCase().endsWith(".pphoto")) {
              await handleExternalFiles([f]);
            } else {
              await importDawWithFeedback(f);
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
          if (f) {
            try {
              editor.loadState(deserializeProject(JSON.parse(await f.text())));
              pushToast("プロジェクトを開きました", "success");
            } catch {
              pushToast("プロジェクトの読み込みに失敗しました", "error");
            }
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
          if (f) void applyCaptionFile(f);
          e.target.value = "";
        }}
      />

      <div className="workspace">
        <Sidebar
          state={state}
          editor={editor}
          tab={prefs.sidebarTab}
          isPro={prefs.mode === "pro"}
          onTab={(t) => patchUi({ sidebarTab: t })}
          onImport={() => fileRef.current?.click()}
          onImportDaw={() => dawRef.current?.click()}
          onImportCaptions={() => captionRef.current?.click()}
          onExportCaptions={() => {
            const srt = editor.exportCaptionsSrt();
            if (!srt.trim()) {
              pushToast("書き出すテロップがありません", "error");
              return;
            }
            const base = (state.title || "captions").replace(/\.(mp4|webm|srt)$/i, "");
            downloadBlob(new Blob([srt], { type: "text/plain;charset=utf-8" }), `${base}.srt`);
            pushToast("SRT 字幕ファイルを書き出しました", "success");
          }}
          onDropFiles={(files) => void handleExternalFiles(files)}
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
            safeZone={prefs.safeZoneGuide}
            onToggleSafeZone={() => patchUi({ safeZoneGuide: !prefs.safeZoneGuide })}
          />
          <TransportBar
            state={state}
            editor={editor}
            onPlayToggle={togglePlay}
            onSeek={seekTo}
          />
        </div>

        <InspectorPanel
          state={state}
          editor={editor}
          tab={prefs.inspectorTab}
          onTab={(t) => patchUi({ inspectorTab: t })}
          exportFormat={prefs.exportFormat}
          onExportFormat={(f) => patchUi({ exportFormat: f })}
        />
      </div>

      <Timeline
        state={state}
        editor={editor}
        height={prefs.timelineHeight}
        onResizeHeight={(h) =>
          patchUi({ timelineHeight: Math.min(540, Math.max(190, Math.round(h))) })
        }
        onSeek={seekTo}
        onStatus={(m) => pushToast(m, "info")}
        onImportExternalFiles={(files, trackId, startSec) =>
          void handleExternalFiles(files, trackId, startSec)
        }
      />

      <StatusBar state={state} statusMsg={statusMsg} />
      <HelpDialog open={prefs.helpOpen} onClose={() => patchUi({ helpOpen: false })} />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
