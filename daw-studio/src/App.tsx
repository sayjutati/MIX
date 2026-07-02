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
  Headphones,
  Repeat,
  Magnet,
  Timer,
  Gauge,
  ZoomIn,
  ZoomOut,
  Maximize,
  Undo2,
  Redo2,
  Clock,
  HelpCircle,
} from "lucide-react";
import { audioEngine } from "./audio/engine";
import { createMediaRecorder, createMicStream, listMicDevices } from "./audio/recording";
import { encodeMixdown, EXPORT_FORMAT_OPTIONS, type ExportFormat } from "./audio/export";
import { audioBufferToWav, renderMixdown, renderTrackStem } from "./audio/mixdown";
import { deserializeProject, serializeProject } from "./storage/projectIO";
import { clearAutosave, loadAutosave } from "./storage/autosave";
import { AutosaveScheduler } from "./storage/autosaveScheduler";
import { bufferToBytes, downloadZip } from "./audio/zipExport";
import { EmptyWorkspace } from "./components/EmptyWorkspace";
import { FxPanel, type FxMode } from "./components/FxPanel";
import { bufferToMono, renderPitchCorrected, renderWholeShift } from "./audio/pitch";
import { alignVocalToBgm } from "./audio/autoAlign";
import { detectNotesAsync } from "./audio/pitchDetectClient";
import { TrackItem } from "./components/TrackItem";
import { MasterMeter } from "./components/MasterMeter";
import { InputMeter } from "./components/InputMeter";
import { FxHelpContext } from "./components/FxHelpTooltip";
import { GlobalTooltip } from "./components/GlobalTooltip";
import {
  PIXELS_PER_SECOND,
  MIN_PX_PER_SEC,
  MAX_PX_PER_SEC,
  TRACK_HEADER_WIDTH,
  TIMELINE_PAD,
  timelineX,
  timeFromTimelineX,
  playheadVisualX,
  trackTimelineEnd,
  clipEffectiveOffset,
  clipPlayDuration,
  clipsOverlap,
  makeClip,
  createTrack,
  TRACK_COLORS,
  type Clip,
  type PitchNote,
  type Track,
  type ProjectFile,
} from "./types";
import { formatTime, formatBarsBeats } from "./utils/time";
import "./App.css";

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("wav");
  const [mp3Bitrate, setMp3Bitrate] = useState(192);
  const [normalizeExport, setNormalizeExport] = useState(true);
  const [exportStems, setExportStems] = useState(false);
  const [fxPanelHeight, setFxPanelHeight] = useState(280);
  const [autosaveReady, setAutosaveReady] = useState(false);
  const autosaveSchedulerRef = useRef(new AutosaveScheduler());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordOffsetRef = useRef(0);
  const recordTargetRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [monitorOn, setMonitorOn] = useState(true);
  const monitorOnRef = useRef(monitorOn);
  monitorOnRef.current = monitorOn;
  const [autoLatencyComp, setAutoLatencyComp] = useState(true);
  const autoLatencyCompRef = useRef(autoLatencyComp);
  autoLatencyCompRef.current = autoLatencyComp;
  const [micDeviceId, setMicDeviceId] = useState<string>("");
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);

  const [globalTime, setGlobalTime] = useState(0);
  const globalTimeRef = useRef(0);
  globalTimeRef.current = globalTime;
  const [isPlayingGlobal, setIsPlayingGlobal] = useState(false);
  const [isEditingGlobalTime, setIsEditingGlobalTime] = useState(false);
  const [masterVolume, setMasterVolume] = useState(1);
  const [bpm, setBpm] = useState(120);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const bpmRef = useRef(bpm);
  const masterVolumeRef = useRef(masterVolume);
  const pitchLimitRef = useRef(2);
  bpmRef.current = bpm;
  masterVolumeRef.current = masterVolume;
  const nextClickRef = useRef(0);
  const isDraggingPlayheadRef = useRef(false);
  const actionsRef = useRef<{
    isPlaying: boolean;
    isRecording: boolean;
    selectedTrackId: number | null;
    play: () => Promise<void> | void;
    stop: () => void;
    startRecording: () => Promise<void> | void;
    stopRecording: () => void;
    seek: (t: number) => void;
    deleteTrack: (id: number) => void;
    undo: () => void;
    redo: () => void;
    zoomBy: (f: number) => void;
    fit: () => void;
    toggleLoop: () => void;
  }>(null as never);

  // ズーム
  const [pxPerSec, setPxPerSec] = useState(PIXELS_PER_SECOND);
  const pxPerSecRef = useRef(pxPerSec);
  pxPerSecRef.current = pxPerSec;

  // ループ区間 (A–B)
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(0);
  const loopRef = useRef({ enabled: false, start: 0, end: 0 });
  loopRef.current = { enabled: loopEnabled, start: loopStart, end: loopEnd };

  // スナップ / カウントイン / 小節拍表示
  const [snapOn, setSnapOn] = useState(false);
  const [countInOn, setCountInOn] = useState(false);
  const [showBarsBeats, setShowBarsBeats] = useState(false);
  const [fxHelpOn, setFxHelpOn] = useState(true);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    trackId: number;
    clipId?: number;
  } | null>(null);

  const hasSolo = tracks.some((t) => t.isSolo);
  const hasBgm = tracks.some((t) => t.kind === "bgm");
  const selectedTrack = tracks.find((t) => t.id === selectedTrackId);
  const playheadTrack = selectedTrack ?? tracks[0];
  const playheadTrackRef = useRef(playheadTrack);
  playheadTrackRef.current = playheadTrack;
  const maxDuration = Math.max(15, ...tracks.map((t) => trackTimelineEnd(t)));

  // Undo / Redo（構造操作のスナップショット）
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const pastRef = useRef<Track[][]>([]);
  const futureRef = useRef<Track[][]>([]);
  const [histTick, setHistTick] = useState(0);
  const pushHistory = useCallback(() => {
    pastRef.current.push(tracksRef.current);
    if (pastRef.current.length > 60) pastRef.current.shift();
    futureRef.current = [];
    setHistTick((n) => n + 1);
  }, []);
  const undo = useCallback(() => {
    if (!pastRef.current.length) return;
    const prev = pastRef.current.pop()!;
    futureRef.current.push(tracksRef.current);
    setTracks(prev);
    setHistTick((n) => n + 1);
  }, []);
  const redo = useCallback(() => {
    if (!futureRef.current.length) return;
    const next = futureRef.current.pop()!;
    pastRef.current.push(tracksRef.current);
    setTracks(next);
    setHistTick((n) => n + 1);
  }, []);
  void histTick;

  const updateTrack = useCallback((id: number, field: keyof Track, value: Track[keyof Track]) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  }, []);

  const applyPreset = useCallback(
    (id: number, values: Partial<Track>) => {
      pushHistory();
      setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, ...values } : t)));
    },
    [pushHistory]
  );

  const updateClip = useCallback(
    (trackId: number, clipId: number, field: keyof Clip, value: number) => {
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId
            ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, [field]: value } : c)) }
            : t
        )
      );
    },
    []
  );

  const deleteClip = useCallback(
    (trackId: number, clipId: number) => {
      pushHistory();
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) } : t
        )
      );
    },
    [pushHistory]
  );

  // ---- ピッチ編集モード ----
  const [fxMode, setFxMode] = useState<FxMode>("fx");
  const [pitchClipId, setPitchClipId] = useState<number | null>(null);
  const [pitchLimit, setPitchLimit] = useState(2);
  pitchLimitRef.current = pitchLimit;
  const [pitchAnalyzing, setPitchAnalyzing] = useState(false);
  const [pitchApplying, setPitchApplying] = useState(false);

  const patchClip = useCallback(
    (trackId: number, clipId: number, patch: Partial<Clip>) => {
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId
            ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) }
            : t
        )
      );
    },
    []
  );

  const pitchTrack = selectedTrack && selectedTrack.kind !== "bgm" ? selectedTrack : undefined;
  const pitchClip = pitchTrack
    ? pitchTrack.clips.find((c) => c.id === pitchClipId) ?? pitchTrack.clips[0]
    : undefined;

  const pitchPlayLocal = (() => {
    if (!pitchTrack || !pitchClip) return null;
    const speed = pitchTrack.speed ?? 1;
    const local = (globalTime - pitchClip.offset) * speed;
    return local >= 0 && local <= pitchClip.duration ? local : null;
  })();

  const analyzePitchClip = useCallback(
    async (trackId: number, clipId: number) => {
      const tr = tracksRef.current.find((t) => t.id === trackId);
      const clip = tr?.clips.find((c) => c.id === clipId);
      if (!clip) return;
      setPitchAnalyzing(true);
      try {
        const { ctx } = audioEngine.getContext();
        const srcUrl = clip.originalUrl ?? clip.url;
        const buf = await ctx.decodeAudioData(await (await fetch(srcUrl)).arrayBuffer());
        const notes = await detectNotesAsync(bufferToMono(buf), buf.sampleRate);
        patchClip(trackId, clipId, {
          notes,
          originalUrl: clip.originalUrl ?? clip.url,
        });
      } catch (e) {
        console.error("ピッチ解析に失敗:", e);
        patchClip(trackId, clipId, { notes: [] });
      } finally {
        setPitchAnalyzing(false);
      }
    },
    [patchClip]
  );

  // ピッチモードで未解析のクリップを自動解析
  useEffect(() => { 
    if (fxMode !== "pitch" || !pitchTrack || !pitchClip) return;
    if (pitchClip.notes === undefined && !pitchAnalyzing) {
      void analyzePitchClip(pitchTrack.id, pitchClip.id);
    }
  }, [fxMode, pitchTrack, pitchClip, pitchAnalyzing, analyzePitchClip]);

  const changePitchNotes = useCallback(
    (notes: PitchNote[]) => {
      if (!pitchTrack || !pitchClip) return;
      patchClip(pitchTrack.id, pitchClip.id, { notes });
      audioEngine.setClipPitch(pitchTrack.id, pitchClip.id, notes);
    },
    [pitchTrack, pitchClip, patchClip]
  );

  useEffect(() => {
    audioEngine.setGlobalPitchLimit(pitchLimit);
  }, [pitchLimit]);

  const handlePitchLimitChange = useCallback(
    (n: number) => {
      setPitchLimit(n);
      audioEngine.setGlobalPitchLimit(n);
      if (pitchTrack && pitchClip?.notes) {
        const clamped = pitchClip.notes.map((nt) => ({
          ...nt,
          shift: Math.max(-n, Math.min(n, nt.shift)),
        }));
        patchClip(pitchTrack.id, pitchClip.id, { notes: clamped });
        audioEngine.setClipPitch(pitchTrack.id, pitchClip.id, clamped);
      }
    },
    [pitchTrack, pitchClip, patchClip]
  );

  const applyPitch = useCallback(async () => {
    if (!pitchTrack || !pitchClip || !pitchClip.notes) return;
    setPitchApplying(true);
    try {
      const { ctx } = audioEngine.getContext();
      const original = pitchClip.originalUrl ?? pitchClip.url;
      const buf = await ctx.decodeAudioData(await (await fetch(original)).arrayBuffer());
      const rendered = renderPitchCorrected(buf, pitchClip.notes, pitchLimit);
      const url = URL.createObjectURL(audioBufferToWav(rendered));
      pushHistory();
      patchClip(pitchTrack.id, pitchClip.id, {
        url,
        originalUrl: original,
        duration: rendered.duration,
        notes: pitchClip.notes.map((n) => ({ ...n, shift: 0 })),
      });
    } catch (e) {
      console.error("ピッチ適用に失敗:", e);
      alert("ピッチ適用に失敗しました。");
    } finally {
      setPitchApplying(false);
    }
  }, [pitchTrack, pitchClip, pitchLimit, patchClip, pushHistory]);

  const resetPitch = useCallback(() => {
    if (!pitchTrack || !pitchClip) return;
    const notes = (pitchClip.notes ?? []).map((n) => ({ ...n, shift: 0 }));
    pushHistory();
    patchClip(pitchTrack.id, pitchClip.id, {
      notes,
      url: pitchClip.originalUrl ?? pitchClip.url,
    });
    audioEngine.setClipPitch(pitchTrack.id, pitchClip.id, notes);
  }, [pitchTrack, pitchClip, patchClip, pushHistory]);

  const reanalyzePitch = useCallback(() => {
    if (!pitchTrack || !pitchClip) return;
    void analyzePitchClip(pitchTrack.id, pitchClip.id);
  }, [pitchTrack, pitchClip, analyzePitchClip]);

  useEffect(() => {
    audioEngine.setMasterVolume(masterVolume);
  }, [masterVolume]);

  // マイク一覧の取得＆デバイス変更の監視
  useEffect(() => {
    void listMicDevices().then(setMicDevices);
    const onChange = () => void listMicDevices().then(setMicDevices);
    navigator.mediaDevices?.addEventListener?.("devicechange", onChange);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", onChange);
  }, []);

  useEffect(() => {
    audioEngine.setGlobalTimeProvider(() => globalTimeRef.current);
  }, []);

  useEffect(() => {
    if (!isPlayingGlobal && !isRecording) return;

    const interval = setInterval(() => {
      const currentTime = audioEngine.tickTransport();

      // ループ区間: 終端に達したら始点へ
      const lp = loopRef.current;
      if (lp.enabled && lp.end - lp.start > 0.05 && currentTime >= lp.end) {
        seekFnRef.current(lp.start);
        return;
      }

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
        const playheadX =
          playheadVisualX(currentTime, playheadTrackRef.current, pxPerSecRef.current) -
          TRACK_HEADER_WIDTH;
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

  // キーボードショートカット
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const a = actionsRef.current;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? a.redo() : a.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        a.redo();
      } else if (e.code === "Space") {
        e.preventDefault();
        a.isPlaying ? a.stop() : void a.play();
      } else if ((e.key === "r" || e.key === "R") && !mod) {
        a.isRecording ? a.stopRecording() : void a.startRecording();
      } else if (e.key === "Home") {
        a.seek(0);
      } else if (e.key === "Delete" && a.selectedTrackId != null) {
        e.preventDefault();
        a.deleteTrack(a.selectedTrackId);
      } else if (e.key === "+" || e.key === "=") {
        a.zoomBy(1.25);
      } else if (e.key === "-" || e.key === "_") {
        a.zoomBy(0.8);
      } else if ((e.key === "l" || e.key === "L") && !mod) {
        a.toggleLoop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
      const playheadX = playheadVisualX(t, playheadTrack, pxPerSec) - TRACK_HEADER_WIDTH;
      const visible = container.clientWidth - TRACK_HEADER_WIDTH;
      if (playheadX < container.scrollLeft || playheadX > container.scrollLeft + visible) {
        container.scrollLeft = Math.max(0, playheadX - 100);
      }
    }
  };
  const seekFnRef = useRef(seekToTime);
  seekFnRef.current = seekToTime;

  // 起動時：自動保存があれば復元を提案
  useEffect(() => {
    void loadAutosave().then((saved) => {
      if (!saved || tracksRef.current.length > 0) {
        setAutosaveReady(true);
        return;
      }
      const when = new Date(saved.savedAt).toLocaleString();
      if (
        window.confirm(
          `前回の自動保存（${when}）が見つかりました。\n作業を復元しますか？`
        )
      ) {
        setTracks(saved.data.tracks);
        setBpm(saved.data.bpm);
        setMasterVolume(saved.data.masterVolume);
        setPitchLimit(saved.data.pitchLimit);
        seekToTime(saved.data.globalTime);
      }
      setAutosaveReady(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autosaveReady) return;
    return autosaveSchedulerRef.current.start(() => ({
      tracks: tracksRef.current,
      bpm: bpmRef.current,
      masterVolume: masterVolumeRef.current,
      globalTime: globalTimeRef.current,
      pitchLimit: pitchLimitRef.current,
    }));
  }, [autosaveReady]);

  useEffect(() => {
    if (!autosaveReady || tracks.length === 0) return;
    autosaveSchedulerRef.current.schedule(4000);
  }, [tracks, bpm, masterVolume, pitchLimit, autosaveReady]);

  const clientXToTime = (clientX: number) => {
    const el = scrollContainerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    return timeFromTimelineX(x, pxPerSec);
  };

  // ズーム
  const clampPps = (v: number) => Math.max(MIN_PX_PER_SEC, Math.min(MAX_PX_PER_SEC, v));
  const zoomBy = (factor: number) => setPxPerSec((p) => clampPps(Math.round(p * factor)));
  const fitToWidth = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const visible = el.clientWidth - TRACK_HEADER_WIDTH - 24;
    const dur = Math.max(8, maxDuration);
    setPxPerSec(clampPps(visible / dur));
  };

  // トラック並び替え
  const moveTrack = (id: number, dir: -1 | 1) => {
    pushHistory();
    setTracks((prev) => {
      const i = prev.findIndex((t) => t.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  // 録音前カウントイン（4拍）
  const playCountIn = async () => {
    await audioEngine.ensureRunning();
    const { ctx } = audioEngine.getContext();
    const beat = 60 / bpm;
    const beats = 4;
    for (let i = 0; i < beats; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = i === 0 ? 1500 : 1000;
      osc.connect(g);
      g.connect(ctx.destination);
      const t0 = ctx.currentTime + i * beat;
      g.gain.setValueAtTime(0.5, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
      osc.start(t0);
      osc.stop(t0 + 0.1);
    }
    await new Promise((r) => setTimeout(r, beats * beat * 1000));
    // カウントイン分だけタイムラインを進める（録音開始位置を正しくする）
    const dt = beats * beat;
    const newTime = globalTimeRef.current + dt;
    globalTimeRef.current = newTime;
    setGlobalTime(newTime);
    audioEngine.seek(newTime);
  };

  const handlePlayheadDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    let dragging = false;

    const onMove = (ev: PointerEvent) => {
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) < 4) return;
        dragging = true;
        isDraggingPlayheadRef.current = true;
      }
      seekToTime(clientXToTime(ev.clientX));
    };
    const onUp = () => {
      isDraggingPlayheadRef.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
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
      const data = await serializeProject(tracks, bpm, masterVolume, globalTime, pitchLimit);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
      a.download = "my_project.daw"; 
      a.click();
      void clearAutosave();
    } catch {
      alert("保存に失敗しました。");
    }
  };

  const loadProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as ProjectFile;
      const restored = await deserializeProject(parsed);
      setTracks(restored.tracks);
      setBpm(restored.bpm);
      setMasterVolume(restored.masterVolume);
      setPitchLimit(restored.pitchLimit);
      seekToTime(restored.globalTime);
      void clearAutosave();
    } catch {
      alert("プロジェクトの読み込みに失敗しました。");
    }
    e.target.value = "";
  };

  const downloadBuffer = (buffer: AudioBuffer, filename: string) => {
    const { blob, extension } = encodeMixdown(buffer, exportFormat, mp3Bitrate);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}.${extension}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportMixdown = async () => {
    if (tracks.length === 0) return alert("書き出すトラックがありません！");
    const formatLabel = exportFormat.toUpperCase();
    const extra =
      exportFormat === "mp3" ? `\nビットレート: ${mp3Bitrate} kbps` : "";
    const stemNote = exportStems ? "\n＋ ステムを ZIP に同梱" : "";
    if (
      !window.confirm(
        `全トラックをミックスして ${formatLabel} で書き出しますか？${extra}${stemNote}\n（FX・ピッチ編集・採用テイクを反映）`
      )
    ) {
      return;
    }
    try {
      const mixOpts = { normalize: normalizeExport, pitchLimit };
      const buffer = await renderMixdown(tracks, hasSolo, masterVolume, mixOpts);
      const ext = exportFormat === "mp3" ? "mp3" : "wav";

      if (exportStems) {
        const entries = [
          {
            name: `My_Mixdown.${ext}`,
            data: await bufferToBytes(buffer, exportFormat, mp3Bitrate),
          },
        ];
      for (const track of tracks) {
          if (track.isMuted || track.clips.every((c) => c.muted)) continue;
          const stem = await renderTrackStem(track, masterVolume, mixOpts);
          if (!stem) continue;
          const safe =
            track.name.replace(/[^\w\u3040-\u30ff\u4e00-\u9faf-]+/g, "_") || "track";
          entries.push({
            name: `stems/${safe}.${ext}`,
            data: await bufferToBytes(stem, exportFormat, mp3Bitrate),
          });
        }
        downloadZip(entries, `My_Mix_Export.zip`);
        alert(`ZIP（ミックス＋${entries.length - 1}ステム）の書き出しが完了しました！`);
      } else {
        downloadBuffer(buffer, "My_Mixdown");
        alert(`${formatLabel} の書き出しが完了しました！`);
      }
    } catch (err) {
      console.error(err);
      alert(
        exportFormat === "mp3"
          ? "MP3の書き出しに失敗しました。WAVで再試行するか、ページを再読み込みしてください。"
          : "エクスポートに失敗しました。"
      );
    }
  };

  const selectTake = useCallback(
    (trackId: number, clipId: number) => {
      pushHistory();
      setTracks((prev) =>
        prev.map((t) => {
          if (t.id !== trackId) return t;
          const picked = t.clips.find((c) => c.id === clipId);
          if (!picked) return t;
          return {
            ...t,
            clips: t.clips.map((c) => {
              if (c.id === clipId) return { ...c, muted: false };
              if (clipsOverlap(t, c, picked)) return { ...c, muted: true };
              return c;
            }),
          };
        })
      );
      audioEngine.restartIfPlaying(trackId);
      autosaveSchedulerRef.current.flush();
    },
    [pushHistory]
  );

  const toggleTakeMuted = useCallback(
    (trackId: number, clipId: number) => {
      pushHistory();
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId
            ? {
                ...t,
                clips: t.clips.map((c) =>
                  c.id === clipId ? { ...c, muted: !c.muted } : c
                ),
              }
            : t
        )
      );
      audioEngine.restartIfPlaying(trackId);
      autosaveSchedulerRef.current.flush();
    },
    [pushHistory]
  );

  const auditionTake = useCallback((trackId: number, clipId: number) => {
    const tr = tracksRef.current.find((t) => t.id === trackId);
    const clip = tr?.clips.find((c) => c.id === clipId);
    if (!tr || !clip) return;
    const offset = clipEffectiveOffset(tr, clip);
    seekFnRef.current(offset);
    globalTimeRef.current = offset;
    setGlobalTime(offset);
    void audioEngine.auditionClip(trackId, clipId, offset).then(() => {
      setIsPlayingGlobal(true);
    });
  }, []);

  const addTracksFromFiles = (files: FileList | File[], kind: Track["kind"] = "bgm") => {
    const list = Array.from(files).filter((f) => f.type.startsWith("audio/") || /\.(wav|mp3|ogg|m4a|flac|webm)$/i.test(f.name));
    if (list.length === 0) return alert("音声ファイルを選択してください。");

    pushHistory();
    setTracks((prev) => {
      const added = list.map((file, i) =>
        createTrack({
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
      const stream = await createMicStream(micDeviceId || undefined);
      recordStreamRef.current = stream;
      // 初回許可後にデバイス名が取れるので一覧を更新
      void listMicDevices().then(setMicDevices);
      await audioEngine.startInputMeter(stream);
      const recorder = createMediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      // 選択中がボーカルレーンなら、そのレーンに重ねて録る
      const target =
        selectedTrack && selectedTrack.kind !== "bgm" ? selectedTrack.id : null;
      recordTargetRef.current = target;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        const anchorSec = recordOffsetRef.current;
        let latencyFallbackSec = 0;
        if (autoLatencyCompRef.current) {
          const settings = recordStreamRef.current?.getAudioTracks()[0]?.getSettings() as
            | (MediaTrackSettings & { latency?: number })
            | undefined;
          const inputLatency = settings?.latency ?? 0;
          latencyFallbackSec = audioEngine.getOutputLatencySec() + inputLatency;
          if (latencyFallbackSec < 0.005) latencyFallbackSec = 0.03;
        }

        recordStreamRef.current?.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;
        audioEngine.stopInputMeter();
        audioEngine.stopMonitor();
        const blobType = recorder.mimeType || "audio/webm";
        const rawBlob = new Blob(audioChunksRef.current, { type: blobType });
        const targetId = recordTargetRef.current;

        let url: string;
        let duration = 0;
        let offset = anchorSec;
        try {
          const { ctx } = audioEngine.getContext();
          const decoded = await ctx.decodeAudioData(await rawBlob.arrayBuffer());
          duration = decoded.duration;

          if (autoLatencyCompRef.current) {
            const aligned = await alignVocalToBgm(
              tracksRef.current,
              decoded,
              anchorSec,
              ctx,
              latencyFallbackSec
            );
            offset = aligned.offsetSec;
          }

          url = URL.createObjectURL(audioBufferToWav(decoded));
        } catch (err) {
          console.error("録音データのデコードに失敗。元データで保存します:", err);
          url = URL.createObjectURL(rawBlob);
          if (autoLatencyCompRef.current) {
            offset = Math.max(0, anchorSec - latencyFallbackSec);
          }
        }

        pushHistory();
        setTracks((prev) => {
          if (targetId != null && prev.some((t) => t.id === targetId)) {
            return prev.map((t) =>
              t.id === targetId
                ? {
                    ...t,
                    clips: [
                      ...t.clips.map((c) => ({ ...c, muted: true })),
                      makeClip({ url, offset, duration }),
                    ],
                  }
                : t
            );
          }
          const t = createTrack({
            id: Date.now(),
            url,
            name: `ボーカル ${prev.filter((x) => x.kind !== "bgm").length + 1}`,
            color: TRACK_COLORS[prev.length % TRACK_COLORS.length],
            kind: "vocal",
            offset,
            duration,
          });
          setSelectedTrackId(t.id);
          return [...prev, t];
        });

        // 録音後は再生ヘッドを録音開始位置へ戻す（押せばすぐ録ったテイクが聴ける）
        setGlobalTime(offset);
        globalTimeRef.current = offset;
        audioEngine.seek(offset);
        autosaveSchedulerRef.current.flush();
      };

      if (monitorOnRef.current) {
        await audioEngine.startMonitor(stream);
      }

      // BGM を先に再生してからカウントイン（曲に合わせて歌い始められる）
      const hasPlayable = tracks.some((t) => t.clips.length > 0);
      if (hasPlayable) {
        await audioEngine.ensureRunning();
        await audioEngine.play(globalTimeRef.current);
      setIsPlayingGlobal(true);
        nextClickRef.current = Math.ceil(globalTimeRef.current / (60 / bpm)) * (60 / bpm);
      }

      if (countInOn) {
        await playCountIn();
        if (mediaRecorderRef.current !== recorder) return; // 停止された
      }

      recordOffsetRef.current = globalTimeRef.current;
      recorder.start(250);

      setIsRecording(true);
      if (!hasPlayable) setIsPlayingGlobal(true);
    } catch {
      alert("マイクの使用が許可されていません。");
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    audioEngine.stopMonitor();
    mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPlayingGlobal(false);
  };

  const deleteTrack = (id: number) => {
    pushHistory();
    setTracks((prev) => prev.filter((t) => t.id !== id));
    if (selectedTrackId === id) setSelectedTrackId(null);
  };

  const duplicateTrack = (track: Track) => {
    pushHistory();
    setTracks((prev) => [
      ...prev,
      {
        ...track,
        id: Date.now(),
        name: `${track.name} (コピー)`,
        clips: track.clips.map((c) => {
          const nc = makeClip({ url: c.url, offset: c.offset, duration: c.duration });
          if (c.notes) nc.notes = c.notes.map((n, i) => ({ ...n, id: Date.now() * 1000 + i }));
          if (c.originalUrl) nc.originalUrl = c.originalUrl;
          return nc;
        }),
      },
    ]);
  };

  const loopTrackAudio = async (trackId: number, times: number) => {
    setContextMenu(null);
    const track = tracks.find((t) => t.id === trackId);
    const clip = track?.clips[0];
    if (!track || !clip || !window.confirm(`先頭テイクを ${times} 倍にループしますか？`)) return;
    try {
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(await (await fetch(clip.url)).arrayBuffer());
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
      const url = URL.createObjectURL(wavBlob);
      pushHistory();
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId
            ? {
                ...t,
                clips: t.clips.map((c) =>
                  c.id === clip.id ? { ...c, url, duration: buf.duration * times } : c
                ),
              }
            : t
        )
      );
    } catch {
      alert("ループ処理に失敗しました。");
    }
  };

  /** ピッチノート列を分割位置で2つに分ける（クリップ内ローカル秒） */
  const splitNotesAt = (notes: PitchNote[] | undefined, at: number) => {
    if (!notes?.length) return [undefined, undefined] as const;
    const left = notes
      .filter((n) => n.start < at - 0.01)
      .map((n) => ({ ...n, end: Math.min(n.end, at) }))
      .filter((n) => n.end - n.start > 0.01);
    const right = notes
      .filter((n) => n.end > at + 0.01)
      .map((n, i) => ({
        ...n,
        id: Date.now() * 1000 + i,
        start: Math.max(0, n.start - at),
        end: n.end - at,
      }))
      .filter((n) => n.end - n.start > 0.01);
    return [left.length ? left : undefined, right.length ? right : undefined] as const;
  };

  /** 再生ヘッド位置でクリップを2つに分割 */
  const splitClipAtPlayhead = async (trackId: number, clipId: number) => {
    const tr = tracksRef.current.find((t) => t.id === trackId);
    const clip = tr?.clips.find((c) => c.id === clipId);
    if (!tr || !clip) return;
    const speed = tr.speed || 1;
    const splitSource = (globalTimeRef.current - clipEffectiveOffset(tr, clip)) * speed;
    if (splitSource <= 0.05 || splitSource >= clip.duration - 0.05) {
      alert("再生ヘッドを、分割したいクリップの内側（端から少し離れた位置）に置いてください。");
      return;
    }
    try {
      const { ctx } = audioEngine.getContext();
      const buf = await ctx.decodeAudioData(await (await fetch(clip.url)).arrayBuffer());
      const sr = buf.sampleRate;
      const splitSample = Math.min(buf.length - 1, Math.max(1, Math.floor(splitSource * sr)));
      const makePart = (from: number, to: number) => {
        const len = to - from;
        const out = new AudioBuffer({
          length: len,
          numberOfChannels: buf.numberOfChannels,
          sampleRate: sr,
        });
        for (let c = 0; c < buf.numberOfChannels; c++) {
          out.getChannelData(c).set(buf.getChannelData(c).subarray(from, to));
        }
        return out;
      };
      const aBuf = makePart(0, splitSample);
      const bBuf = makePart(splitSample, buf.length);
      const aUrl = URL.createObjectURL(audioBufferToWav(aBuf));
      const bUrl = URL.createObjectURL(audioBufferToWav(bBuf));
      const [notesA, notesB] = splitNotesAt(clip.notes, splitSource);
      pushHistory();
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId
            ? {
                ...t,
                clips: t.clips.flatMap((c) =>
                  c.id === clipId
                    ? [
                        (() => {
                          const nc = makeClip({ url: aUrl, offset: c.offset, duration: aBuf.duration });
                          if (notesA) nc.notes = notesA;
                          return nc;
                        })(),
                        (() => {
                          const nc = makeClip({
                            url: bUrl,
                            offset: c.offset + aBuf.duration / speed,
                            duration: bBuf.duration,
                          });
                          if (notesB) nc.notes = notesB;
                          return nc;
                        })(),
                      ]
                    : [c]
                ),
              }
            : t
        )
      );
    } catch (e) {
      console.error(e);
      alert("分割に失敗しました。");
    }
  };

  /** クリップを複製（同じレーンに少し右へ） */
  const duplicateClip = (trackId: number, clipId: number) => {
    const tr = tracksRef.current.find((t) => t.id === trackId);
    const clip = tr?.clips.find((c) => c.id === clipId);
    if (!tr || !clip) return;
    pushHistory();
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id !== trackId) return t;
        const nc = makeClip({
          url: clip.url,
          offset: clip.offset + clipPlayDuration(tr, clip),
          duration: clip.duration,
        });
        if (clip.notes) nc.notes = clip.notes.map((n, i) => ({ ...n, id: Date.now() * 1000 + i }));
        if (clip.originalUrl) nc.originalUrl = clip.originalUrl;
        return { ...t, clips: [...t.clips, nc] };
      })
    );
  };

  /** ハモリ生成：クリップをピッチシフトして新規レーンを作る */
  const generateHarmony = async (trackId: number, clipId: number, semitones: number) => {
    const tr = tracksRef.current.find((t) => t.id === trackId);
    const clip = tr?.clips.find((c) => c.id === clipId);
    if (!tr || !clip) return;
    try {
      const { ctx } = audioEngine.getContext();
      const src = clip.originalUrl ?? clip.url;
      const buf = await ctx.decodeAudioData(await (await fetch(src)).arrayBuffer());
      const shifted = renderWholeShift(buf, semitones);
      const url = URL.createObjectURL(audioBufferToWav(shifted));
      pushHistory();
      setTracks((prev) => {
        const nt = createTrack({
          id: Date.now(),
          url,
          name: `${tr.name} ハモリ(${semitones > 0 ? "+" : ""}${semitones})`,
          color: TRACK_COLORS[prev.length % TRACK_COLORS.length],
          kind: "vocal",
          offset: clipEffectiveOffset(tr, clip),
          duration: shifted.duration,
        });
        nt.volume = 0.6;
        nt.pan = semitones > 0 ? 0.25 : -0.25;
        setSelectedTrackId(nt.id);
        return [...prev, nt];
      });
    } catch (e) {
      console.error(e);
      alert("ハモリ生成に失敗しました。");
    }
  };

  const timelineTicks = Array.from({ length: Math.ceil(maxDuration) + 21 }, (_, i) => i);

  // ズームに応じたルーラー目盛り間隔（秒）
  const tickStep = (() => {
    const target = 56; // 目盛り間の最小px
    const raw = target / pxPerSec;
    return [1, 2, 5, 10, 15, 30, 60].find((s) => s >= raw) ?? 60;
  })();

  // 小節/拍グリッド線
  const gridLines: { t: number; bar: boolean }[] = [];
  {
    const beatLen = 60 / bpm;
    const beatPx = beatLen * pxPerSec;
    if (beatPx >= 4) {
      const showBeats = beatPx >= 14;
      const total = Math.ceil(maxDuration / beatLen);
      for (let i = 0; i <= total && gridLines.length < 2000; i++) {
        const bar = i % 4 === 0;
        if (showBeats || bar) gridLines.push({ t: i * beatLen, bar });
      }
    }
  }

  // キーボードショートカットの最新ハンドラを保持
  actionsRef.current = {
    isPlaying: isPlayingGlobal,
    isRecording,
    selectedTrackId,
    play: playAll,
    stop: stopAll,
    startRecording,
    stopRecording,
    seek: seekToTime,
    deleteTrack,
    undo,
    redo,
    zoomBy,
    fit: fitToWidth,
    toggleLoop: () => setLoopEnabled((v) => !v),
  };

  return (
    <FxHelpContext.Provider value={fxHelpOn}>
    <GlobalTooltip enabled={fxHelpOn} />
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
          <label className="toolbar__check tooltip" data-tooltip="ミックス＋トラック別ステムを1つのZIPで書き出す（動画編集向け）">
            <input
              type="checkbox"
              checked={exportStems}
              onChange={(e) => setExportStems(e.target.checked)}
            />
            ステム
          </label>
          <label className="toolbar__check tooltip" data-tooltip="書き出し時に音量を自動最適化（−1dBまで持ち上げ）">
            <input
              type="checkbox"
              checked={normalizeExport}
              onChange={(e) => setNormalizeExport(e.target.checked)}
            />
            音量最適化
          </label>
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
              <span className={isRecording ? "transport__time--rec" : ""}>
                {showBarsBeats ? formatBarsBeats(globalTime, bpm) : formatTime(globalTime)}
              </span>
            )}
          </div>
          {!isRecording ? (
            <button
              type="button"
              className="transport__btn-rec tooltip"
              data-tooltip={
                selectedTrack && selectedTrack.kind !== "bgm"
                  ? `「${selectedTrack.name}」に重ねて録音`
                  : hasBgm
                  ? "BGM再生しながら新規レーンに録音"
                  : "録音（BGM追加後はオケに合わせて重ね録り）"
              }
              onClick={() => void startRecording()}
            >
              <Mic size={20} />
            </button>
          ) : (
            <button type="button" className="transport__btn-rec transport__btn-rec--active" onClick={stopRecording}>
              <Square size={16} fill="currentColor" />
            </button>
          )}
          <button
            type="button"
            className={`transport__btn-monitor tooltip ${monitorOn ? "transport__btn-monitor--on" : ""}`}
            data-tooltip={
              monitorOn
                ? "録音モニターON（自分の声が聞こえる・ヘッドホン推奨）"
                : "録音モニターOFF"
            }
            onClick={() => {
              setMonitorOn((v) => {
                const next = !v;
                if (isRecording && recordStreamRef.current) {
                  if (next) void audioEngine.startMonitor(recordStreamRef.current);
                  else audioEngine.stopMonitor();
                }
                return next;
              });
            }}
          >
            <Headphones size={18} />
          </button>
          {isRecording && <InputMeter />}

          <div className="transport__divider" />

          <button
            type="button"
            className={`transport__btn-ghost tooltip ${loopEnabled ? "transport__btn-ghost--on" : ""}`}
            data-tooltip="ループ再生 ON/OFF（A〜B区間を繰り返す・Lキー）"
            onClick={() => setLoopEnabled((v) => !v)}
          >
            <Repeat size={18} />
          </button>
          <button
            type="button"
            className="transport__ab tooltip"
            data-tooltip="ループ始点(A)を再生位置に設定"
            onClick={() => {
              setLoopStart(globalTime);
              if (globalTime >= loopEnd) setLoopEnd(globalTime + 4);
              setLoopEnabled(true);
            }}
          >
            A
          </button>
          <button
            type="button"
            className="transport__ab tooltip"
            data-tooltip="ループ終点(B)を再生位置に設定"
            onClick={() => {
              setLoopEnd(Math.max(globalTime, loopStart + 0.1));
              setLoopEnabled(true);
            }}
          >
            B
          </button>
          <button
            type="button"
            className={`transport__btn-ghost tooltip ${snapOn ? "transport__btn-ghost--on" : ""}`}
            data-tooltip="スナップ：クリップ移動を拍にぴったり吸着"
            onClick={() => setSnapOn((v) => !v)}
          >
            <Magnet size={18} />
          </button>
          <button
            type="button"
            className={`transport__btn-ghost tooltip ${countInOn ? "transport__btn-ghost--on" : ""}`}
            data-tooltip="カウントイン：録音前に4拍カウント"
            onClick={() => setCountInOn((v) => !v)}
          >
            <Timer size={18} />
            </button>
          </div>
          
        <div className="toolbar__right">
          <label className="toolbar__mic tooltip" data-tooltip="録音に使うマイクを選択">
            <Mic size={14} />
            <select value={micDeviceId} onChange={(e) => setMicDeviceId(e.target.value)}>
              <option value="">既定のマイク</option>
              {micDevices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `マイク ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`toolbar__icon tooltip ${autoLatencyComp ? "toolbar__icon--on" : ""}`}
            data-tooltip={
              autoLatencyComp
                ? "音ズレ自動補正：ON（録音後にBGMと照合して自動で合わせる）"
                : "音ズレ自動補正：OFF"
            }
            onClick={() => setAutoLatencyComp((v) => !v)}
          >
            <Gauge size={16} />
          </button>
          <div className="toolbar__divider" />
          <button
            type="button"
            className={`toolbar__icon tooltip ${fxHelpOn ? "toolbar__icon--on" : ""}`}
            data-tooltip={fxHelpOn ? "機能説明ポップアップ：ON（クリックでOFF）" : "機能説明ポップアップ：OFF（クリックでON）"}
            onClick={() => setFxHelpOn((v) => !v)}
          >
            <HelpCircle size={16} />
          </button>
          <div className="toolbar__divider" />
          <button
            type="button"
            className="toolbar__icon tooltip"
            data-tooltip="元に戻す (Ctrl+Z)"
            disabled={pastRef.current.length === 0}
            onClick={undo}
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            className="toolbar__icon tooltip"
            data-tooltip="やり直す (Ctrl+Shift+Z)"
            disabled={futureRef.current.length === 0}
            onClick={redo}
          >
            <Redo2 size={16} />
          </button>
          <div className="toolbar__divider" />
          <div className="toolbar__zoom">
            <button type="button" className="toolbar__icon tooltip" data-tooltip="ズームアウト (−)" onClick={() => zoomBy(0.8)}>
              <ZoomOut size={16} />
            </button>
            <input
              type="range"
              min={MIN_PX_PER_SEC}
              max={MAX_PX_PER_SEC}
              step={1}
              value={pxPerSec}
              onChange={(e) => setPxPerSec(Number(e.target.value))}
              className="toolbar__zoom-slider tooltip"
              data-tooltip={`ズーム ${Math.round(pxPerSec)}px/秒`}
            />
            <button type="button" className="toolbar__icon tooltip" data-tooltip="ズームイン (+)" onClick={() => zoomBy(1.25)}>
              <ZoomIn size={16} />
            </button>
            <button type="button" className="toolbar__icon tooltip" data-tooltip="画面幅に合わせる" onClick={fitToWidth}>
              <Maximize size={16} />
            </button>
          </div>
          <div className="toolbar__divider" />
          <label className="toolbar__bpm">
            BPM
            <input type="number" min={40} max={240} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
          </label>
          <button
            type="button"
            className={`toolbar__icon tooltip ${showBarsBeats ? "toolbar__icon--on" : ""}`}
            data-tooltip={showBarsBeats ? "表示：小節:拍（クリックで秒に）" : "表示：秒（クリックで小節:拍に）"}
            onClick={() => setShowBarsBeats((v) => !v)}
          >
            <Clock size={16} />
          </button>
          <button
            type="button"
            className={`toolbar__metro ${metronomeOn ? "toolbar__metro--on" : ""}`}
            onClick={() => setMetronomeOn((v) => !v)}
          >
            {metronomeOn ? <Bell size={18} /> : <BellOff size={18} />}
          </button>
          <MasterMeter />
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
        <div className="workspace__inner" style={{ minWidth: `${timelineX(maxDuration, pxPerSec)}px` }}>
          <div className="timeline-ruler">
            <div className="timeline-ruler__label">TIMELINE</div>
            <div className="timeline-ruler__ticks">
              {timelineTicks
                .filter((t) => t % tickStep === 0)
                .map((t) => (
                  <div
                    key={t}
                    className={`timeline-tick ${t % (tickStep * 5) === 0 ? "timeline-tick--major" : ""}`}
                    style={{ left: `${TIMELINE_PAD + t * pxPerSec}px` }}
                  >
                    {t % (tickStep * 5) === 0
                      ? showBarsBeats
                        ? formatBarsBeats(t, bpm).split(".")[0]
                        : `${t}s`
                      : null}
                </div>
              ))}
            </div>
          </div>

          {tracks.length > 0 && (
            <div className="timeline-grid" aria-hidden>
              {gridLines.map((g) => (
                <div
                  key={g.t}
                  className={`timeline-grid__line ${g.bar ? "timeline-grid__line--bar" : ""}`}
                  style={{ left: `${timelineX(g.t, pxPerSec)}px` }}
            />
          ))}
          </div>
          )}

          {loopEnabled && loopEnd > loopStart && (
            <div
              className="loop-region"
              aria-hidden
              style={{
                left: `${timelineX(loopStart, pxPerSec)}px`,
                width: `${(loopEnd - loopStart) * pxPerSec}px`,
              }}
            />
          )}

          {tracks.length === 0 ? (
            <EmptyWorkspace
              hasBgm={hasBgm}
              onImport={() => document.getElementById("import-audio")?.click()}
              onRecord={() => void startRecording()}
            />
          ) : (
            tracks.map((track, idx) => (
              <TrackItem
                key={track.id}
                track={track}
                isSelected={selectedTrackId === track.id}
                hasSolo={hasSolo}
                globalTime={globalTime}
                pxPerSec={pxPerSec}
                snapSeconds={snapOn ? 60 / bpm : 0}
                index={idx}
                total={tracks.length}
                onMove={moveTrack}
                onSelect={setSelectedTrackId}
                onDelete={deleteTrack}
                onDuplicate={duplicateTrack}
                onUpdate={updateTrack}
                onUpdateClip={updateClip}
                onDeleteClip={deleteClip}
                onClipDragStart={pushHistory}
                onContextMenu={(e, id, clipId) => {
                  e.preventDefault();
                  setContextMenu({ x: e.pageX, y: e.pageY, trackId: id, clipId });
                }}
              />
            ))
          )}

          <div
            className="playhead"
            style={{ left: `${playheadVisualX(globalTime, playheadTrack, pxPerSec)}px` }}
            onPointerDown={handlePlayheadDragStart}
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
        onApplyPreset={applyPreset}
        fxMode={fxMode}
        onFxModeChange={setFxMode}
        pitchClipId={pitchClipId}
        onSelectPitchClip={setPitchClipId}
        playLocalTime={pitchPlayLocal}
        pitchAnalyzing={pitchAnalyzing}
        pitchApplying={pitchApplying}
        pitchLimit={pitchLimit}
        onPitchLimitChange={handlePitchLimitChange}
        onChangeClipNotes={changePitchNotes}
        onApplyPitch={applyPitch}
        onResetPitch={resetPitch}
        onReanalyzePitch={reanalyzePitch}
        onSelectTake={selectTake}
        onAuditionTake={auditionTake}
        onToggleTakeMuted={toggleTakeMuted}
      />

      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          {contextMenu.clipId != null ? (
            <>
              <div className="context-menu__title">クリップの編集</div>
              <button
                type="button"
                onClick={() => {
                  void splitClipAtPlayhead(contextMenu.trackId, contextMenu.clipId!);
                  setContextMenu(null);
                }}
              >
                ✂ 再生ヘッド位置で分割
              </button>
              <button
                type="button"
                onClick={() => {
                  duplicateClip(contextMenu.trackId, contextMenu.clipId!);
                  setContextMenu(null);
                }}
              >
                ⧉ このクリップを複製
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteClip(contextMenu.trackId, contextMenu.clipId!);
                  setContextMenu(null);
                }}
              >
                🗑 このクリップを削除
              </button>
              <div className="context-menu__sep" />
              <div className="context-menu__title">ハモリ生成（別レーン）</div>
              <button
                type="button"
                onClick={() => {
                  void generateHarmony(contextMenu.trackId, contextMenu.clipId!, 4);
                  setContextMenu(null);
                }}
              >
                ♪ ハモリ 上（+4半音 / 3度上）
              </button>
              <button
                type="button"
                onClick={() => {
                  void generateHarmony(contextMenu.trackId, contextMenu.clipId!, -3);
                  setContextMenu(null);
                }}
              >
                ♪ ハモリ 下（−3半音 / 3度下）
              </button>
              <button
                type="button"
                onClick={() => {
                  void generateHarmony(contextMenu.trackId, contextMenu.clipId!, 7);
                  setContextMenu(null);
                }}
              >
                ♪ ハモリ 上（+7半音 / 5度上）
              </button>
            </>
          ) : (
            <>
              <div className="context-menu__title">音声の編集</div>
              <button type="button" onClick={() => loopTrackAudio(contextMenu.trackId, 2)}>
                2倍にループ複製
              </button>
              <button type="button" onClick={() => loopTrackAudio(contextMenu.trackId, 4)}>
                4倍にループ複製
              </button>
            </>
          )}
        </div>
      )}
    </div>
    </FxHelpContext.Provider>
  );
}

export default App;
