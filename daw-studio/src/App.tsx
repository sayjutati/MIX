import { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Square,
  Mic,
  SkipBack,
  Save,
  FolderOpen,
  Download,
  Music,
  Bell,
  BellOff,
  Volume2,
} from "lucide-react";
import { audioEngine } from "./audio/engine";
import { createMediaRecorder, createMicStream } from "./audio/recording";
import { encodeMixdown, EXPORT_FORMAT_OPTIONS, type ExportFormat } from "./audio/export";
import { audioBufferToWav, renderMixdown } from "./audio/mixdown";
import { EmptyWorkspace } from "./components/EmptyWorkspace";
import { FxPanel } from "./components/FxPanel";
import { TrackItem } from "./components/TrackItem";
import {
  PROJECT_VERSION,
  PIXELS_PER_SECOND,
  TRACK_HEADER_WIDTH,
  TIMELINE_PAD,
  timelineX,
  timeFromTimelineX,
  playheadVisualX,
  trackEffectiveOffset,
  TRACK_COLORS,
  defaultTrack,
  type Track,
  type ProjectFile,
} from "./types";
import { formatTime } from "./utils/time";
import "./App.css";

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("wav");
  const [mp3Bitrate, setMp3Bitrate] = useState(192);
  const [fxPanelHeight, setFxPanelHeight] = useState(280);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordOffsetRef = useRef(0);
  const audioChunksRef = useRef<Blob[]>([]);

  const [globalTime, setGlobalTime] = useState(0);
  const globalTimeRef = useRef(0);
  globalTimeRef.current = globalTime;
  const [isPlayingGlobal, setIsPlayingGlobal] = useState(false);
  const [isEditingGlobalTime, setIsEditingGlobalTime] = useState(false);
  const [masterVolume, setMasterVolume] = useState(1);
  const [bpm, setBpm] = useState(120);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const nextClickRef = useRef(0);
  const isDraggingPlayheadRef = useRef(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; trackId: number } | null>(
    null
  );

  const hasSolo = tracks.some((t) => t.isSolo);
  const hasBgm = tracks.some((t) => t.kind === "bgm");
  const selectedTrack = tracks.find((t) => t.id === selectedTrackId);
  const playheadTrack = selectedTrack ?? tracks[0];
  const maxDuration = Math.max(15, ...tracks.map((t) => trackEffectiveOffset(t) + (t.duration || 0)));

  const updateTrack = useCallback((id: number, field: keyof Track, value: Track[keyof Track]) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  }, []);

  useEffect(() => {
    audioEngine.setMasterVolume(masterVolume);
  }, [masterVolume]);

  useEffect(() => {
    audioEngine.setGlobalTimeProvider(() => globalTimeRef.current);
  }, []);

  useEffect(() => {
    if (!isPlayingGlobal && !isRecording) return;

    const interval = setInterval(() => {
      const currentTime = audioEngine.tickTransport();
      setGlobalTime(currentTime);
      globalTimeRef.current = currentTime;

      if (metronomeOn) {
        void audioEngine.ensureRunning().then(() => {
          const { ctx } = audioEngine.getContext();
          const beatLen = 60 / bpm;
          while (nextClickRef.current < currentTime + 0.1) {
            if (nextClickRef.current >= currentTime) {
              const osc = ctx.createOscillator();
              osc.frequency.value = 1000;
              osc.connect(ctx.destination);
              const t0 = ctx.currentTime + (nextClickRef.current - currentTime);
              osc.start(t0);
              osc.stop(t0 + 0.05);
            }
            nextClickRef.current += beatLen;
          }
        });
      }

      const container = scrollContainerRef.current;
      if (container) {
        const playheadX = playheadVisualX(currentTime, playheadTrack) - TRACK_HEADER_WIDTH;
        const visible = container.clientWidth - TRACK_HEADER_WIDTH;
        container.scrollLeft = Math.max(0, playheadX - visible / 2);
      }
    }, 30);

    return () => clearInterval(interval);
  }, [isPlayingGlobal, isRecording, metronomeOn, bpm]);

  useEffect(() => {
    if (!isPlayingGlobal && !isRecording) {
      audioEngine.stop();
      return;
    }
    void audioEngine.play(globalTimeRef.current);
  }, [isPlayingGlobal, isRecording]);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const handlePanelResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = fxPanelHeight;
    const onMove = (ev: MouseEvent) => {
      setFxPanelHeight(Math.max(120, Math.min(600, startHeight + (startY - ev.clientY))));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const seekToTime = (time: number) => {
    const t = Math.max(0, time);
    setGlobalTime(t);
    globalTimeRef.current = t;
    audioEngine.seek(t);
    nextClickRef.current = Math.ceil(t / (60 / bpm)) * (60 / bpm);
    const container = scrollContainerRef.current;
    if (container) {
      const playheadX = playheadVisualX(t, playheadTrack) - TRACK_HEADER_WIDTH;
      const visible = container.clientWidth - TRACK_HEADER_WIDTH;
      if (playheadX < container.scrollLeft || playheadX > container.scrollLeft + visible) {
        container.scrollLeft = Math.max(0, playheadX - 100);
      }
    }
  };

  const clientXToTime = (clientX: number) => {
    const el = scrollContainerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    return timeFromTimelineX(x);
  };

  const handlePlayheadDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    let dragging = false;

    const onMove = (ev: MouseEvent) => {
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) < 4) return;
        dragging = true;
        isDraggingPlayheadRef.current = true;
      }
      seekToTime(clientXToTime(ev.clientX));
    };
    const onUp = () => {
      isDraggingPlayheadRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".track-clip")) return;
    if ((e.target as HTMLElement).closest(".playhead")) return;
    if (isDraggingPlayheadRef.current) return;
    seekToTime(clientXToTime(e.clientX));
  };

  const playAll = async () => {
    await audioEngine.ensureRunning();
    nextClickRef.current = Math.ceil(globalTimeRef.current / (60 / bpm)) * (60 / bpm);
    setIsPlayingGlobal(true);
  };

  const stopAll = () => {
    setIsPlayingGlobal(false);
    setIsRecording(false);
  };

  const saveProject = async () => {
    if (tracks.length === 0) return alert("保存するトラックがありません！");
    try {
      const projectTracks = await Promise.all(
        tracks.map(async (track) => {
          const res = await fetch(track.url);
          const blob = await res.blob();
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          return { ...track, audioData: base64 };
        })
      );
      const data: ProjectFile = {
        version: PROJECT_VERSION,
        tracks: projectTracks,
        bpm,
        masterVolume,
        globalTime,
      };
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
      a.download = "my_project.daw";
      a.click();
    } catch {
      alert("保存に失敗しました。");
    }
  };

  const loadProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as ProjectFile;
      setBpm(parsed.bpm ?? 120);
      setMasterVolume(parsed.masterVolume ?? 1);
      const restored = await Promise.all(
        parsed.tracks.map(async (td) => {
          const res = await fetch(td.audioData!);
          const blob = await res.blob();
          const { audioData: _, ...rest } = td;
          return {
            ...rest,
            url: URL.createObjectURL(blob),
            kind: rest.kind ?? "vocal",
            pitch: rest.pitch ?? 0,
            nudgeMs: rest.nudgeMs ?? 0,
            isMuted: rest.isMuted ?? false,
          } as Track;
        })
      );
      setTracks(restored);
      seekToTime(parsed.globalTime ?? 0);
    } catch {
      alert("プロジェクトの読み込みに失敗しました。");
    }
    e.target.value = "";
  };

  const exportMixdown = async () => {
    if (tracks.length === 0) return alert("書き出すトラックがありません！");
    const formatLabel = exportFormat.toUpperCase();
    const extra =
      exportFormat === "mp3" ? `\nビットレート: ${mp3Bitrate} kbps` : "";
    if (
      !window.confirm(
        `全トラックをミックスして ${formatLabel} で書き出しますか？${extra}\n（エフェクト・パン・音量を反映）`
      )
    ) {
      return;
    }
    try {
      const buffer = await renderMixdown(tracks, hasSolo, masterVolume);
      const { blob, extension } = encodeMixdown(
        buffer,
        exportFormat,
        mp3Bitrate
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `My_Mixdown.${extension}`;
      a.click();
      URL.revokeObjectURL(a.href);
      alert(`${formatLabel} の書き出しが完了しました！`);
    } catch (err) {
      console.error(err);
      alert(
        exportFormat === "mp3"
          ? "MP3の書き出しに失敗しました。WAVで再試行するか、ページを再読み込みしてください。"
          : "エクスポートに失敗しました。"
      );
    }
  };

  const addTracksFromFiles = (files: FileList | File[], kind: Track["kind"] = "bgm") => {
    const list = Array.from(files).filter((f) => f.type.startsWith("audio/") || /\.(wav|mp3|ogg|m4a|flac|webm)$/i.test(f.name));
    if (list.length === 0) return alert("音声ファイルを選択してください。");

    setTracks((prev) => {
      const added = list.map((file, i) =>
        defaultTrack({
          id: Date.now() + i,
          url: URL.createObjectURL(file),
          name: file.name.replace(/\.[^/.]+$/, ""),
          color: TRACK_COLORS[(prev.length + i) % TRACK_COLORS.length],
          kind,
          offset: 0,
        })
      );
      setSelectedTrackId(added[added.length - 1].id);
      return [...prev, ...added];
    });
  };

  const handleImportAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addTracksFromFiles(e.target.files, "bgm");
    e.target.value = "";
  };

  const startRecording = async () => {
    try {
      const stream = await createMicStream();
      recordStreamRef.current = stream;
      const recorder = createMediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        recordStreamRef.current?.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;
        const blobType = recorder.mimeType || "audio/webm";
        const url = URL.createObjectURL(new Blob(audioChunksRef.current, { type: blobType }));
        const offset = recordOffsetRef.current;

        setTracks((prev) => {
          const t = defaultTrack({
            id: Date.now(),
            url,
            name: `ボーカル ${prev.filter((x) => x.kind !== "bgm").length + 1}`,
            color: TRACK_COLORS[prev.length % TRACK_COLORS.length],
            kind: "vocal",
            offset,
          });
          setSelectedTrackId(t.id);
          return [...prev, t];
        });
      };

      recordOffsetRef.current = globalTimeRef.current;
      recorder.start(250);

      setIsRecording(true);
      setIsPlayingGlobal(true);
      nextClickRef.current = Math.ceil(globalTimeRef.current / (60 / bpm)) * (60 / bpm);
    } catch {
      alert("マイクの使用が許可されていません。");
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    mediaRecorderRef.current.requestData();
    mediaRecorderRef.current.stop();
    setIsRecording(false);
    setIsPlayingGlobal(false);
  };

  const deleteTrack = (id: number) => {
    setTracks((prev) => prev.filter((t) => t.id !== id));
    if (selectedTrackId === id) setSelectedTrackId(null);
  };

  const duplicateTrack = (track: Track) =>
    setTracks((prev) => [
      ...prev,
      { ...track, id: Date.now(), name: `${track.name} (コピー)`, url: track.url },
    ]);

  const loopTrackAudio = async (trackId: number, times: number) => {
    const track = tracks.find((t) => t.id === trackId);
    if (!track || !window.confirm(`このトラックを ${times} 倍にループ複製しますか？`)) return;
    try {
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(await (await fetch(track.url)).arrayBuffer());
      const newBuf = ctx.createBuffer(
        buf.numberOfChannels,
        buf.length * times,
        buf.sampleRate
      );
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const ch = buf.getChannelData(c);
        const out = newBuf.getChannelData(c);
        for (let i = 0; i < times; i++) out.set(ch, i * buf.length);
      }
      const wavBlob = audioBufferToWav(newBuf);
      updateTrack(track.id, "url", URL.createObjectURL(wavBlob));
      updateTrack(track.id, "duration", buf.duration * times);
    } catch {
      alert("ループ処理に失敗しました。");
    }
  };

  const timelineTicks = Array.from({ length: maxDuration + 21 }, (_, i) => i);

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar__left">
          <span className="toolbar__brand">MIX DAW</span>
          <input type="file" id="load-project" accept=".daw,application/json" hidden onChange={loadProject} />
          <button type="button" className="btn btn--ghost tooltip" data-tooltip="プロジェクト保存" onClick={saveProject}>
            <Save size={16} /> 保存
          </button>
          <button
            type="button"
            className="btn btn--ghost tooltip"
            data-tooltip="プロジェクト読込"
            onClick={() => document.getElementById("load-project")?.click()}
          >
            <FolderOpen size={16} /> 読込
          </button>
          <div className="toolbar__divider" />
          <select
            className="toolbar__format tooltip"
            data-tooltip="書き出し形式"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
          >
            {EXPORT_FORMAT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label} — {opt.hint}
              </option>
            ))}
          </select>
          {exportFormat === "mp3" && (
            <select
              className="toolbar__format tooltip"
              data-tooltip="MP3音質"
              value={mp3Bitrate}
              onChange={(e) => setMp3Bitrate(Number(e.target.value))}
            >
              <option value={128}>128 kbps</option>
              <option value={192}>192 kbps</option>
              <option value={256}>256 kbps</option>
              <option value={320}>320 kbps</option>
            </select>
          )}
          <button type="button" className="btn btn--export tooltip" data-tooltip="全トラックをミックスして書き出し" onClick={exportMixdown}>
            <Download size={16} /> 書き出し
          </button>
          <input
            type="file"
            id="import-audio"
            accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.webm"
            multiple
            hidden
            onChange={handleImportAudio}
          />
          <button
            type="button"
            className="btn btn--primary tooltip"
            data-tooltip="端末の音源（オケ）をプロジェクトに追加"
            onClick={() => document.getElementById("import-audio")?.click()}
          >
            <Music size={16} /> BGM / 音源追加
          </button>
        </div>

        <div className="transport">
          <button type="button" className="tooltip transport__btn-ghost" data-tooltip="最初に戻る" onClick={() => seekToTime(0)}>
            <SkipBack size={20} />
          </button>
          {isPlayingGlobal ? (
            <button type="button" className="transport__btn-stop" onClick={stopAll}>
              <Square size={20} fill="currentColor" />
            </button>
          ) : (
            <button type="button" className="transport__btn-play" onClick={() => void playAll()}>
              <Play size={22} fill="currentColor" style={{ marginLeft: 4 }} />
            </button>
          )}
          <div
            className="transport__time tooltip"
            data-tooltip="クリックで秒数入力"
            onClick={() => {
              if (!isRecording && !isPlayingGlobal) setIsEditingGlobalTime(true);
            }}
          >
            {isEditingGlobalTime ? (
              <input
                type="number"
                step="0.1"
                defaultValue={globalTime.toFixed(1)}
                autoFocus
                onBlur={(e) => {
                  setIsEditingGlobalTime(false);
                  const v = parseFloat(e.currentTarget.value);
                  if (!isNaN(v)) seekToTime(Math.max(0, v));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            ) : (
              <span className={isRecording ? "transport__time--rec" : ""}>{formatTime(globalTime)}</span>
            )}
          </div>
          {!isRecording ? (
            <button
              type="button"
              className="transport__btn-rec tooltip"
              data-tooltip={hasBgm ? "BGM再生しながらオーバーダビ録音" : "録音（BGM追加後はオケに合わせて重ね録り）"}
              onClick={() => void startRecording()}
            >
              <Mic size={20} />
            </button>
          ) : (
            <button type="button" className="transport__btn-rec transport__btn-rec--active" onClick={stopRecording}>
              <Square size={16} fill="currentColor" />
            </button>
          )}
        </div>

        <div className="toolbar__right">
          <label className="toolbar__bpm">
            BPM
            <input type="number" min={40} max={240} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
          </label>
          <button
            type="button"
            className={`toolbar__metro ${metronomeOn ? "toolbar__metro--on" : ""}`}
            onClick={() => setMetronomeOn((v) => !v)}
          >
            {metronomeOn ? <Bell size={18} /> : <BellOff size={18} />}
          </button>
          <label className="toolbar__master tooltip" data-tooltip="マスター音量">
            <Volume2 size={16} />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={masterVolume}
              onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
            />
          </label>
        </div>
      </header>

      <div ref={scrollContainerRef} className="workspace" onClick={handleTimelineClick}>
        <div className="workspace__inner" style={{ minWidth: `${timelineX(maxDuration)}px` }}>
          <div className="timeline-ruler">
            <div className="timeline-ruler__label">TIMELINE</div>
            <div className="timeline-ruler__ticks">
              {timelineTicks.map((t) => (
                <div
                  key={t}
                  className={`timeline-tick ${t % 5 === 0 ? "timeline-tick--major" : ""}`}
                  style={{ left: `${TIMELINE_PAD + t * PIXELS_PER_SECOND}px` }}
                >
                  {t % 5 === 0 ? `${t}s` : null}
                </div>
              ))}
            </div>
          </div>

          {tracks.length === 0 ? (
            <EmptyWorkspace
              hasBgm={hasBgm}
              onImport={() => document.getElementById("import-audio")?.click()}
              onRecord={() => void startRecording()}
            />
          ) : (
            tracks.map((track) => (
              <TrackItem
                key={track.id}
                track={track}
                isSelected={selectedTrackId === track.id}
                hasSolo={hasSolo}
                globalTime={globalTime}
                onSelect={setSelectedTrackId}
                onDelete={deleteTrack}
                onDuplicate={duplicateTrack}
                onUpdate={updateTrack}
                onContextMenu={(e, id) => {
                  e.preventDefault();
                  setContextMenu({ x: e.pageX, y: e.pageY, trackId: id });
                }}
              />
            ))
          )}

          <div
            className="playhead"
            style={{ left: `${playheadVisualX(globalTime, playheadTrack)}px` }}
            onMouseDown={handlePlayheadDragStart}
            onClick={(e) => e.stopPropagation()}
            title="ドラッグして再生位置を移動"
          >
            <div className="playhead__line" aria-hidden />
          </div>
        </div>
      </div>

      <FxPanel
        height={fxPanelHeight}
        selectedTrack={selectedTrack}
        onResizeStart={handlePanelResizeStart}
        onUpdate={updateTrack}
      />

      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <div className="context-menu__title">音声の編集</div>
          <button type="button" onClick={() => loopTrackAudio(contextMenu.trackId, 2)}>
            2倍にループ複製
          </button>
          <button type="button" onClick={() => loopTrackAudio(contextMenu.trackId, 4)}>
            4倍にループ複製
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
