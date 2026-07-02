import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bindSchedulerProject, bindSchedulerTransport, scheduler } from "./audio/lookaheadScheduler";
import { initAudioGraph } from "./audio/engine";
import { playMetronomeClick } from "./audio/metronome";
import { downloadBlob, encodeExport, safeFilename, type ExportFormat } from "./audio/export";
import { normalizeBuffer, projectEndBeat, renderProjectOffline } from "./audio/offlineRender";
import { ArrangementView } from "./components/Arrangement/ArrangementView";
import { ResizablePanel } from "./components/ResizablePanel";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { InstrumentPicker } from "./components/InstrumentPicker";
import type { SaveStatus } from "./components/Transport/TransportBar";
import { createMicStream, recordToBlob } from "./audio/recording";
import { GlobalTooltip } from "./components/GlobalTooltip";
import { MixerPanel } from "./components/Mixer/MixerPanel";
import { BEAT_W } from "./components/PianoRoll/pianoRollConstants";
import { PianoRollView } from "./components/PianoRoll/PianoRollView";
import { PianoRollToolbar } from "./components/PianoRoll/PianoRollToolbar";
import { ProjectBrowser } from "./components/ProjectBrowser/ProjectBrowser";
import { SynthPanel } from "./components/Synth/SynthPanel";
import { AudioPanel } from "./components/AudioTrack/AudioPanel";
import { AudioTrackView } from "./components/AudioTrack/AudioTrackView";
import { FxPanel } from "./components/FxPanel/FxPanel";
import { TrackList } from "./components/TrackList/TrackList";
import { TransportBar } from "./components/Transport/TransportBar";
import { useEditorStore } from "./state/useEditorStore";
import { useHistoryStore } from "./state/useHistoryStore";
import {
  useProjectStore,
  useSelectedNotes,
  useSelectedTrack,
} from "./state/useProjectStore";
import { useTransportStore } from "./state/useTransportStore";
import {
  deleteProject,
  listProjects,
  loadLatestProject,
  loadProject,
  saveProject,
} from "./storage/projectStorage";
import { instrumentEngine } from "./audio/instrumentVoice";
import { fixedDrumVoice } from "./audio/drumMap";
import { previewNote } from "./audio/previewNote";
import type { Project, Track } from "./types/project";
import { isAudioTrack, secToBeat } from "./types/project";
import type { QuantizeGrid } from "./utils/quantize";
import { snapBeat } from "./utils/quantize";
import { pitchFromComputerKey } from "./utils/computerPiano";
import { importMidiAsNewTrack, mergeMidiIntoProject, midiFilename, parseMidi, projectToMidi } from "./utils/midi";
import {
  cloneNotesForClipboard,
  duplicateNotesInPlace,
  nudgeNotePatch,
  pasteNotesAt,
} from "./utils/noteEdit";
import { filterAudioFiles, importAudioFile, importRecordedBlob } from "./utils/audioImport";
import { audioClipPlayer } from "./audio/audioClipPlayer";
import "./index.css";

const HELP_STORAGE_KEY = "dtm-help-on";

export default function App() {
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId);
  const selectedNoteIds = useProjectStore((s) => s.selectedNoteIds);
  const selectTrack = useProjectStore((s) => s.selectTrack);
  const addNote = useProjectStore((s) => s.addNote);
  const selectNotes = useProjectStore((s) => s.selectNotes);
  const toggleNoteSelection = useProjectStore((s) => s.toggleNoteSelection);
  const updateNotes = useProjectStore((s) => s.updateNotes);
  const removeNotes = useProjectStore((s) => s.removeNotes);
  const quantizeNotes = useProjectStore((s) => s.quantizeNotes);
  const setNotesVelocity = useProjectStore((s) => s.setNotesVelocity);
  const setTempo = useProjectStore((s) => s.setTempo);
  const setLoop = useProjectStore((s) => s.setLoop);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const newProject = useProjectStore((s) => s.newProject);
  const addTrack = useProjectStore((s) => s.addTrack);
  const addAudioTrack = useProjectStore((s) => s.addAudioTrack);
  const addAudioClip = useProjectStore((s) => s.addAudioClip);
  const removeAudioClip = useProjectStore((s) => s.removeAudioClip);
  const updateAudioClip = useProjectStore((s) => s.updateAudioClip);
  const updateTrackFx = useProjectStore((s) => s.updateTrackFx);
  const addPluginSlot = useProjectStore((s) => s.addPluginSlot);
  const removePluginSlot = useProjectStore((s) => s.removePluginSlot);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const duplicateTrack = useProjectStore((s) => s.duplicateTrack);
  const insertNotes = useProjectStore((s) => s.insertNotes);
  const transposeNotes = useProjectStore((s) => s.transposeNotes);
  const setMasterVolume = useProjectStore((s) => s.setMasterVolume);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const updateInstrumentForTrack = useProjectStore((s) => s.updateInstrumentForTrack);
  const touch = useProjectStore((s) => s.touch);

  const quantizeGrid = useEditorStore((s) => s.quantizeGrid);
  const setQuantizeGrid = useEditorStore((s) => s.setQuantizeGrid);
  const stepRecord = useEditorStore((s) => s.stepRecord);
  const setStepRecord = useEditorStore((s) => s.setStepRecord);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const setSnapEnabled = useEditorStore((s) => s.setSnapEnabled);
  const beatZoom = useEditorStore((s) => s.beatZoom);
  const setBeatZoom = useEditorStore((s) => s.setBeatZoom);
  const pitchZoom = useEditorStore((s) => s.pitchZoom);
  const setPitchZoom = useEditorStore((s) => s.setPitchZoom);
  const toolMode = useEditorStore((s) => s.toolMode);
  const setToolMode = useEditorStore((s) => s.setToolMode);
  const metronomeOn = useEditorStore((s) => s.metronomeOn);
  const setMetronomeOn = useEditorStore((s) => s.setMetronomeOn);
  const noteClipboard = useEditorStore((s) => s.noteClipboard);
  const setNoteClipboard = useEditorStore((s) => s.setNoteClipboard);
  const overlayTrackIds = useEditorStore((s) => s.overlayTrackIds);
  const toggleOverlayTrack = useEditorStore((s) => s.toggleOverlayTrack);
  const clearOverlayTracks = useEditorStore((s) => s.clearOverlayTracks);

  const pushHistory = useHistoryStore((s) => s.pushHistory);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);
  const clearHistory = useHistoryStore((s) => s.clear);
  const canUndo = useHistoryStore((s) => s.undoStack.length > 0);
  const canRedo = useHistoryStore((s) => s.redoStack.length > 0);

  const playing = useTransportStore((s) => s.playing);
  const playheadBeat = useTransportStore((s) => s.playheadBeat);
  const loopEnabled = useTransportStore((s) => s.loopEnabled);
  const showBarsBeats = useTransportStore((s) => s.showBarsBeats);
  const setPlaying = useTransportStore((s) => s.setPlaying);
  const setPlayheadBeat = useTransportStore((s) => s.setPlayheadBeat);
  const setLoopEnabled = useTransportStore((s) => s.setLoopEnabled);
  const setShowBarsBeats = useTransportStore((s) => s.setShowBarsBeats);

  const track = useSelectedTrack();
  const selectedNotes = useSelectedNotes();

  const overlayTracks = useMemo(
    () =>
      project.tracks.filter(
        (t) => overlayTrackIds.has(t.id) && t.id !== selectedTrackId
      ),
    [project.tracks, overlayTrackIds, selectedTrackId]
  );

  const handleToggleOverlay = useCallback(
    (trackId: string) => {
      toggleOverlayTrack(trackId);
    },
    [toggleOverlayTrack]
  );

  const handleRemoveTrack = useCallback(
    (trackId: string) => {
      if (overlayTrackIds.has(trackId)) toggleOverlayTrack(trackId);
      removeTrack(trackId);
    },
    [overlayTrackIds, toggleOverlayTrack, removeTrack]
  );
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("wav");
  const [helpOn, setHelpOn] = useState(() => {
    try {
      return localStorage.getItem(HELP_STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [projectBrowserOpen, setProjectBrowserOpen] = useState(false);
  const [savedProjects, setSavedProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [activePitches, setActivePitches] = useState<Set<number>>(() => new Set());
  const [recording, setRecording] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [instPickerOpen, setInstPickerOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [trackListW, setTrackListW] = useState(240);
  const [sidePanelW, setSidePanelW] = useState(220);
  const [micDeviceId, setMicDeviceId] = useState("");
  const micStreamRef = useRef<MediaStream | null>(null);
  const recordTaskRef = useRef<Promise<Blob> | null>(null);
  const computerKeysDown = useRef<Set<string>>(new Set());
  const keyRecordRef = useRef<Map<number, { id: string; t0: number }>>(new Map());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTempo = useRef(project.tempo);
  const restored = useRef(false);
  const lastMetBeat = useRef(-1);

  const beatsVisible = useMemo(
    () => Math.max(32, projectEndBeat(project) + 8),
    [project]
  );
  const beatWidth = BEAT_W * beatZoom;
  const trackIsAudio = track != null && isAudioTrack(track);

  const ensureAudioTargetTrack = useCallback(() => {
    const p = useProjectStore.getState().project;
    const sel = useProjectStore.getState().selectedTrackId;
    const current = p.tracks.find((t) => t.id === sel);
    if (current && isAudioTrack(current)) return current.id;
    addAudioTrack();
    return useProjectStore.getState().selectedTrackId!;
  }, [addAudioTrack]);

  const handleImportAudioFiles = useCallback(
    async (files: File[]) => {
      const audioFiles = filterAudioFiles(files);
      if (audioFiles.length === 0) return;
      pushHistory();
      const trackId = ensureAudioTargetTrack();
      let beat = useTransportStore.getState().playheadBeat;
      for (const file of audioFiles) {
        const p = useProjectStore.getState().project;
        const imported = await importAudioFile(p, file, beat);
        addAudioClip(trackId, imported.clip);
        beat += secToBeat(imported.durationSec, p.tempo) + 0.25;
      }
      touch();
      audioClipPlayer.invalidateTracks();
      if (useTransportStore.getState().playing) void scheduler.invalidatePending();
    },
    [pushHistory, ensureAudioTargetTrack, addAudioClip, touch]
  );

  const handleRecorded = useCallback(
    async (blob: Blob, name: string) => {
      pushHistory();
      const trackId = ensureAudioTargetTrack();
      const p = useProjectStore.getState().project;
      const beat = useTransportStore.getState().playheadBeat;
      const imported = await importRecordedBlob(p, blob, name, beat);
      addAudioClip(trackId, imported.clip);
      touch();
      audioClipPlayer.invalidateTracks();
    },
    [pushHistory, ensureAudioTargetTrack, addAudioClip, touch]
  );

  const startRecording = useCallback(async () => {
    try {
      const stream = await createMicStream(micDeviceId || undefined);
      micStreamRef.current = stream;
      recordTaskRef.current = recordToBlob(stream);
      setRecording(true);
    } catch {
      alert("マイクへのアクセスが拒否されました。");
    }
  }, [micDeviceId]);

  const stopRecording = useCallback(async () => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    setRecording(false);
    const task = recordTaskRef.current;
    recordTaskRef.current = null;
    if (!task) return;
    try {
      const blob = await task;
      if (blob.size > 0) {
        await handleRecorded(
          blob,
          `録音 ${new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
        );
      }
    } catch {
      alert("録音の保存に失敗しました。");
    }
  }, [handleRecorded]);

  const handleRecordToggle = useCallback(() => {
    if (recording) void stopRecording();
    else void startRecording();
  }, [recording, startRecording, stopRecording]);

  const flushSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await saveProject(useProjectStore.getState().project);
  }, []);

  const currentInstrument = useMemo(() => {
    if (!track || isAudioTrack(track)) return null;
    return project.instruments.find((i) => i.id === track.instrumentId) ?? null;
  }, [track, project.instruments]);

  // 単体ドラム（キック等）はどの鍵盤でも同じ音なので GM ラベルは出さない
  const drumMode = useMemo(
    () =>
      currentInstrument
        ? instrumentEngine(currentInstrument) === "drum" &&
          !fixedDrumVoice(currentInstrument.kind)
        : false,
    [currentInstrument]
  );

  const avgVelocity = useMemo(() => {
    if (selectedNotes.length === 0) return 100;
    return Math.round(
      selectedNotes.reduce((s, n) => s + n.velocity, 0) / selectedNotes.length
    );
  }, [selectedNotes]);

  useEffect(() => {
    bindSchedulerProject(() => useProjectStore.getState().project);
    bindSchedulerTransport({
      loopEnabled: () => useTransportStore.getState().loopEnabled,
      onEnd: (endBeat) => {
        const beat = Math.min(scheduler.getPlayheadBeat(), endBeat);
        useTransportStore.getState().setPlayheadBeat(beat);
        useTransportStore.getState().setPlaying(false);
        void scheduler.stop();
      },
    });
    void initAudioGraph().catch(() => {});
  }, []);

  useEffect(() => {
    clearOverlayTracks();
  }, [project.id, clearOverlayTracks]);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    void loadLatestProject().then((p) => {
      clearHistory();
      if (p) setProject(p);
      else if (project.tracks[0]) selectTrack(project.tracks[0].id);
    });
  }, [setProject, selectTrack, project.tracks, clearHistory]);

  useEffect(() => {
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveProject(useProjectStore.getState().project).then(() => {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      });
    }, 3000);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [project]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      setPlayheadBeat(scheduler.getPlayheadBeat());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, setPlayheadBeat]);

  useEffect(() => {
    if (!playing || prevTempo.current === project.tempo) {
      prevTempo.current = project.tempo;
      return;
    }
    prevTempo.current = project.tempo;
    void scheduler.syncTempo();
  }, [project.tempo, playing]);

  useEffect(() => {
    if (!playing || !metronomeOn) {
      lastMetBeat.current = -1;
      return;
    }
    const beatInt = Math.floor(playheadBeat);
    if (beatInt >= 0 && beatInt !== lastMetBeat.current) {
      lastMetBeat.current = beatInt;
      void playMetronomeClick(beatInt % 4 === 0);
    }
  }, [playing, metronomeOn, playheadBeat]);

  const handleStop = useCallback(async () => {
    await scheduler.stop();
    setPlaying(false);
  }, [setPlaying]);

  const handlePlay = useCallback(async () => {
    setPlaying(true);
    await scheduler.start(useTransportStore.getState().playheadBeat);
  }, [setPlaying]);

  const seekToBeat = useCallback(
    async (beat: number) => {
      const clamped = Math.max(0, beat);
      setPlayheadBeat(clamped);
      if (useTransportStore.getState().playing) {
        await scheduler.seek(clamped);
      }
    },
    [setPlayheadBeat]
  );

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const p = useProjectStore.getState().project;
      const buf = await renderProjectOffline(p);
      normalizeBuffer(buf);
      const { blob, extension } = encodeExport(buf, exportFormat);
      downloadBlob(blob, `${safeFilename(p.name)}.${extension}`);
    } catch (e) {
      console.error("Export failed:", e);
      alert(`${exportFormat.toUpperCase()} 書き出しに失敗しました。`);
    } finally {
      setExporting(false);
    }
  }, [exportFormat]);

  const handleExportMidi = useCallback(() => {
    const p = useProjectStore.getState().project;
    const bytes = projectToMidi(p);
    downloadBlob(new Blob([bytes], { type: "audio/midi" }), `${midiFilename(p.name)}.mid`);
  }, []);

  const handleImportMidi = useCallback(
    async (file: File) => {
      try {
        const buf = await file.arrayBuffer();
        const parsed = parseMidi(new Uint8Array(buf));
        if (parsed.notes.length === 0) {
          alert("MIDI ファイルにノートが見つかりませんでした。");
          return;
        }
        const asNewTrack = confirm(
          `${parsed.notes.length} ノートをインポートします。\nOK = 新規トラック / キャンセル = 選択中トラックに追加`
        );
        const current = useProjectStore.getState().project;
        if (asNewTrack) {
          setProject(importMidiAsNewTrack(current, parsed, file.name.replace(/\.(mid|midi)$/i, "")));
        } else if (track) {
          setProject(mergeMidiIntoProject(current, track.id, parsed));
        }
        void flushSave();
      } catch (e) {
        console.error("MIDI import failed:", e);
        alert("MIDI インポートに失敗しました。");
      }
    },
    [track, setProject, flushSave]
  );

  const refreshProjectList = useCallback(async () => {
    setProjectsLoading(true);
    try {
      setSavedProjects(await listProjects());
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const handleOpenProjects = useCallback(() => {
    setProjectBrowserOpen(true);
    void refreshProjectList();
  }, [refreshProjectList]);

  const handleOpenProject = useCallback(
    async (id: string) => {
      if (id === useProjectStore.getState().project.id) {
        setProjectBrowserOpen(false);
        return;
      }
      if (useTransportStore.getState().playing) await handleStop();
      await flushSave();
      const loaded = await loadProject(id);
      if (loaded) {
        clearHistory();
        setProject(loaded);
        setProjectBrowserOpen(false);
      }
    },
    [flushSave, setProject, handleStop, clearHistory]
  );

  const handleDeleteProject = useCallback(
    async (id: string) => {
      const p = savedProjects.find((x) => x.id === id);
      if (!p || !confirm(`「${p.name}」を削除しますか？`)) return;
      await deleteProject(id);
      if (id === useProjectStore.getState().project.id) {
        const remaining = (await listProjects()).filter((x) => x.id !== id);
        if (remaining.length > 0) {
          setProject(remaining[remaining.length - 1]!);
        } else {
          newProject();
        }
      }
      await refreshProjectList();
    },
    [savedProjects, setProject, newProject, refreshProjectList]
  );

  const handleNewProject = useCallback(async () => {
    if (useTransportStore.getState().playing) await handleStop();
    if (!confirm("新規プロジェクトを作成します。現在のプロジェクトは IndexedDB に保存済みです。")) return;
    await flushSave();
    clearHistory();
    newProject();
    const t = useProjectStore.getState().project.tracks[0];
    if (t) selectTrack(t.id);
    void saveProject(useProjectStore.getState().project);
  }, [newProject, selectTrack, handleStop, flushSave, clearHistory]);

  const handleEditStart = useCallback(() => {
    pushHistory();
  }, [pushHistory]);

  const handlePickInstrument = useCallback(
    (instrumentId: string) => {
      pushHistory();
      addTrack(instrumentId);
      touch();
      setInstPickerOpen(false);
    },
    [pushHistory, addTrack, touch]
  );

  const handleDuplicateTrack = useCallback(
    (trackId: string) => {
      pushHistory();
      duplicateTrack(trackId);
      touch();
    },
    [pushHistory, duplicateTrack, touch]
  );

  const handleMasterVolume = useCallback(
    (v: number) => {
      setMasterVolume(v);
      if (useTransportStore.getState().playing) void scheduler.invalidatePending();
    },
    [setMasterVolume]
  );

  const handleMixerUpdate = useCallback(
    (id: string, patch: Partial<Track>) => {
      updateTrack(id, patch);
      if (useTransportStore.getState().playing) void scheduler.invalidatePending();
    },
    [updateTrack]
  );

  const handleInstrumentChange = useCallback(
    (patch: Parameters<typeof updateInstrumentForTrack>[1]) => {
      if (!track) return;
      updateInstrumentForTrack(track.id, patch);
      if (useTransportStore.getState().playing) void scheduler.invalidatePending();
    },
    [track, updateInstrumentForTrack]
  );

  const handleCreateNote = useCallback(
    (pitch: number, start: number, duration: number): string | null => {
      if (!track) return null;
      const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      addNote(track.id, {
        id,
        pitch,
        start,
        duration,
        velocity: 100,
      });
      touch();
      return id;
    },
    [track, addNote, touch]
  );

  const playAndMaybeRecord = useCallback(
    (pitch: number) => {
      if (!track || !currentInstrument) return;
      void previewNote(pitch, 100, currentInstrument, track);
      setActivePitches((prev) => new Set(prev).add(pitch));
      if (stepRecord) {
        const beat = useTransportStore.getState().playheadBeat;
        const start = Math.max(0, snapBeat(beat, quantizeGrid));
        const id = handleCreateNote(pitch, start, quantizeGrid);
        if (id) keyRecordRef.current.set(pitch, { id, t0: performance.now() });
      }
    },
    [track, currentInstrument, stepRecord, quantizeGrid, handleCreateNote]
  );

  const releasePitch = useCallback(
    (pitch: number) => {
      setActivePitches((prev) => {
        const next = new Set(prev);
        next.delete(pitch);
        return next;
      });
      const rec = keyRecordRef.current.get(pitch);
      if (rec && stepRecord && track) {
        const elapsedSec = (performance.now() - rec.t0) / 1000;
        const beatDur = Math.max(
          quantizeGrid,
          snapBeat((elapsedSec * project.tempo) / 60, quantizeGrid)
        );
        updateNotes(track.id, [{ noteId: rec.id, patch: { duration: beatDur } }]);
        keyRecordRef.current.delete(pitch);
      }
    },
    [stepRecord, track, project.tempo, quantizeGrid, updateNotes]
  );

  const handleDeleteSelected = useCallback(() => {
    if (!track || selectedNoteIds.size === 0) return;
    pushHistory();
    removeNotes(track.id, [...selectedNoteIds]);
    touch();
  }, [track, selectedNoteIds, removeNotes, touch, pushHistory]);

  const handleQuantize = useCallback(() => {
    if (!track || selectedNoteIds.size === 0) return;
    pushHistory();
    quantizeNotes(track.id, [...selectedNoteIds], quantizeGrid);
    touch();
  }, [track, selectedNoteIds, quantizeGrid, quantizeNotes, touch, pushHistory]);

  const handleCopy = useCallback(() => {
    if (selectedNotes.length === 0) return;
    setNoteClipboard(cloneNotesForClipboard(selectedNotes));
  }, [selectedNotes, setNoteClipboard]);

  const handlePaste = useCallback(() => {
    if (!track || !noteClipboard?.length) return;
    pushHistory();
    const notes = pasteNotesAt(noteClipboard, playheadBeat);
    insertNotes(track.id, notes);
    touch();
  }, [track, noteClipboard, playheadBeat, pushHistory, insertNotes, touch]);

  const handleDuplicateNotes = useCallback(() => {
    if (!track || selectedNotes.length === 0) return;
    pushHistory();
    const notes = duplicateNotesInPlace(selectedNotes, quantizeGrid);
    insertNotes(track.id, notes);
    touch();
  }, [track, selectedNotes, quantizeGrid, pushHistory, insertNotes, touch]);

  const handleTranspose = useCallback(
    (semitones: number) => {
      if (!track || selectedNoteIds.size === 0) return;
      pushHistory();
      transposeNotes(track.id, [...selectedNoteIds], semitones);
      touch();
    },
    [track, selectedNoteIds, pushHistory, transposeNotes, touch]
  );

  const handleSelectAll = useCallback(() => {
    if (!track) return;
    selectNotes(track.notes.map((n) => n.id));
  }, [track, selectNotes]);

  const handleNudge = useCallback(
    (dBeat: number, dPitch: number) => {
      if (!track || selectedNoteIds.size === 0) return;
      pushHistory();
      const updates = track.notes
        .filter((n) => selectedNoteIds.has(n.id))
        .map((n) => ({ noteId: n.id, patch: nudgeNotePatch(n, dBeat, dPitch) }));
      updateNotes(track.id, updates);
      touch();
    },
    [track, selectedNoteIds, pushHistory, updateNotes, touch]
  );

  const handleVelocity = useCallback(
    (v: number) => {
      if (!track || selectedNoteIds.size === 0) return;
      setNotesVelocity(track.id, [...selectedNoteIds], v);
    },
    [track, selectedNoteIds, setNotesVelocity]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key === "c") {
        e.preventDefault();
        handleCopy();
        return;
      }
      if (mod && e.key === "v") {
        e.preventDefault();
        handlePaste();
        return;
      }
      if (mod && e.key === "d") {
        e.preventDefault();
        handleDuplicateNotes();
        return;
      }
      if (mod && e.key === "a") {
        e.preventDefault();
        handleSelectAll();
        return;
      }

      if (e.repeat) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (useTransportStore.getState().playing) void handleStop();
        else void handlePlay();
        return;
      }
      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        setLoopEnabled(!useTransportStore.getState().loopEnabled);
        return;
      }
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        setMetronomeOn(!useEditorStore.getState().metronomeOn);
        return;
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        handleRecordToggle();
        return;
      }
      if (e.key === "1") {
        e.preventDefault();
        setToolMode("select");
        return;
      }
      if (e.key === "2") {
        e.preventDefault();
        setToolMode("draw");
        return;
      }
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      if (selectedNoteIds.size > 0 && !trackIsAudio) {
        if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
          e.preventDefault();
          handleTranspose(e.key === "ArrowUp" ? 1 : -1);
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          handleNudge(-quantizeGrid, 0);
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          handleNudge(quantizeGrid, 0);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          handleNudge(0, 1);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          handleNudge(0, -1);
          return;
        }
      }

      const pitch = pitchFromComputerKey(e.code);
      if (pitch != null && !computerKeysDown.current.has(e.code)) {
        e.preventDefault();
        computerKeysDown.current.add(e.code);
        playAndMaybeRecord(pitch);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const pitch = pitchFromComputerKey(e.code);
      if (pitch != null) {
        computerKeysDown.current.delete(e.code);
        releasePitch(pitch);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    handleDeleteSelected,
    handlePlay,
    handleStop,
    playAndMaybeRecord,
    releasePitch,
    setLoopEnabled,
    setMetronomeOn,
    setToolMode,
    handleRecordToggle,
    undo,
    redo,
    handleCopy,
    handlePaste,
    handleDuplicateNotes,
    handleSelectAll,
    handleTranspose,
    handleNudge,
    selectedNoteIds.size,
    quantizeGrid,
    trackIsAudio,
  ]);

  if (!track) {
    return <div className="app app--empty">トラックがありません</div>;
  }

  const toggleHelp = () => {
    setHelpOn((v) => {
      const next = !v;
      try {
        localStorage.setItem(HELP_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <>
      <GlobalTooltip enabled={helpOn} />
      <ShortcutHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <InstrumentPicker
        open={instPickerOpen}
        instruments={project.instruments}
        onPick={handlePickInstrument}
        onClose={() => setInstPickerOpen(false)}
      />
      <div className="app">
      <TransportBar
        projectName={project.name}
        playing={playing}
        recording={recording}
        exporting={exporting}
        exportFormat={exportFormat}
        helpOn={helpOn}
        saveStatus={saveStatus}
        tempo={project.tempo}
        playheadBeat={playheadBeat}
        loopEnabled={loopEnabled}
        showBarsBeats={showBarsBeats}
        loopStart={project.loopStart}
        loopEnd={project.loopEnd}
        onProjectNameChange={setProjectName}
        onOpenProjects={handleOpenProjects}
        onNewProject={() => void handleNewProject()}
        onPlay={() => void handlePlay()}
        onStop={() => void handleStop()}
        onSeekBeat={(b) => void seekToBeat(b)}
        onExport={() => void handleExport()}
        onExportFormatChange={setExportFormat}
        onImportMidi={(f) => void handleImportMidi(f)}
        onExportMidi={handleExportMidi}
        onTempoChange={setTempo}
        onLoopEnabledChange={setLoopEnabled}
        onShowBarsBeatsChange={setShowBarsBeats}
        onLoopStartChange={(v) => setLoop(v, project.loopEnd)}
        onLoopEndChange={(v) => setLoop(project.loopStart, v)}
        onHelpToggle={toggleHelp}
        onShortcutsOpen={() => setShortcutsOpen(true)}
        onRecordToggle={handleRecordToggle}
        metronomeOn={metronomeOn}
        onMetronomeChange={setMetronomeOn}
      />
      <ProjectBrowser
        open={projectBrowserOpen}
        currentId={project.id}
        projects={savedProjects}
        loading={projectsLoading}
        onClose={() => setProjectBrowserOpen(false)}
        onOpen={(id) => void handleOpenProject(id)}
        onDelete={(id) => void handleDeleteProject(id)}
      />
      <div
        className={`app__workspace${dragOver ? " is-drag-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleImportAudioFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <aside className="track-list" style={{ width: trackListW }}>
        <TrackList
          tracks={project.tracks}
          instruments={project.instruments}
          selectedId={selectedTrackId}
          overlayTrackIds={overlayTrackIds}
          onSelect={selectTrack}
          onToggleOverlay={handleToggleOverlay}
          onAddTrack={() => setInstPickerOpen(true)}
          onAddAudioTrack={addAudioTrack}
          onRemoveTrack={handleRemoveTrack}
          onDuplicateTrack={handleDuplicateTrack}
          onUpdateTrack={handleMixerUpdate}
        />
        </aside>
        <ResizablePanel side="left" width={trackListW} onWidthChange={setTrackListW} />
        <div className="editor-stack">
          <ArrangementView
            project={project}
            selectedTrackId={selectedTrackId}
            playheadBeat={playheadBeat}
            playing={playing}
            beatsVisible={beatsVisible}
            beatWidth={beatWidth}
            onSelectTrack={selectTrack}
            onSeekBeat={(b) => void seekToBeat(b)}
          />
        <main className={`piano-roll${trackIsAudio ? " piano-roll--audio" : ""}`}>
          {trackIsAudio ? (
            <>
              <AudioPanel
                recording={recording}
                deviceId={micDeviceId}
                onDeviceIdChange={setMicDeviceId}
                onImportFiles={(files) => void handleImportAudioFiles(files)}
                onStartRecord={() => void startRecording()}
                onStopRecord={() => void stopRecording()}
              />
              <AudioTrackView
                track={track}
                tempo={project.tempo}
                playheadBeat={playheadBeat}
                playing={playing}
                beatsVisible={beatsVisible}
                beatWidth={beatWidth}
                loopStart={project.loopStart}
                loopEnd={project.loopEnd}
                loopEnabled={loopEnabled}
                onSeekBeat={(b) => void seekToBeat(b)}
                onLoopChange={setLoop}
                onUpdateClip={(clipId, patch) => {
                  updateAudioClip(track.id, clipId, patch);
                  touch();
                }}
                onRemoveClip={(clipId) => {
                  pushHistory();
                  removeAudioClip(track.id, clipId);
                  touch();
                }}
                onEditStart={handleEditStart}
              />
            </>
          ) : (
            <>
          <PianoRollToolbar
            tracks={project.tracks}
            editTrackId={selectedTrackId}
            overlayTrackIds={overlayTrackIds}
            onToggleOverlay={handleToggleOverlay}
            toolMode={toolMode}
            onToolModeChange={setToolMode}
            quantizeGrid={quantizeGrid}
            onQuantizeGridChange={(g) => setQuantizeGrid(g as QuantizeGrid)}
            snapEnabled={snapEnabled}
            onSnapChange={setSnapEnabled}
            beatZoom={beatZoom}
            onBeatZoomChange={setBeatZoom}
            pitchZoom={pitchZoom}
            onPitchZoomChange={setPitchZoom}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            selectedCount={selectedNoteIds.size}
            velocity={avgVelocity}
            stepRecord={stepRecord}
            onStepRecordChange={setStepRecord}
            onVelocityChange={handleVelocity}
            onQuantize={handleQuantize}
            onDelete={handleDeleteSelected}
            onDuplicate={handleDuplicateNotes}
            onCopy={handleCopy}
            onPaste={handlePaste}
            onTranspose={handleTranspose}
            onSelectAll={handleSelectAll}
          />
          <PianoRollView
            editTrack={track}
            overlayTracks={overlayTracks}
            playing={playing}
            playheadBeat={playheadBeat}
            loopStart={project.loopStart}
            loopEnd={project.loopEnd}
            loopEnabled={loopEnabled}
            beatsVisible={beatsVisible}
            beatWidth={beatWidth}
            quantizeGrid={quantizeGrid}
            snapEnabled={snapEnabled}
            toolMode={toolMode}
            pitchZoom={pitchZoom}
            selectedNoteIds={selectedNoteIds}
            activePitches={activePitches}
            drumMode={drumMode}
            onEditStart={handleEditStart}
            onCreateNote={handleCreateNote}
            onSelectNotes={selectNotes}
            onToggleNote={toggleNoteSelection}
            onUpdateNotes={(updates) => updateNotes(track.id, updates)}
            onLoopChange={setLoop}
            onSeekBeat={(b) => void seekToBeat(b)}
            onPianoKeyDown={playAndMaybeRecord}
            onPianoKeyUp={releasePitch}
          />
            </>
          )}
        </main>
        </div>
        <ResizablePanel side="right" width={sidePanelW} onWidthChange={setSidePanelW} />
        <div className="side-panel" style={{ width: sidePanelW }}>
        {trackIsAudio ? (
          <FxPanel
            track={track}
            onFxChange={(patch) => {
              updateTrackFx(track.id, patch);
              if (useTransportStore.getState().playing) void scheduler.invalidatePending();
            }}
            onAddPlugin={(slot) => {
              pushHistory();
              addPluginSlot(track.id, slot);
              touch();
            }}
            onRemovePlugin={(slotId) => {
              pushHistory();
              removePluginSlot(track.id, slotId);
              touch();
            }}
          />
        ) : (
        currentInstrument && (
          <SynthPanel
            params={currentInstrument.params}
            instrumentName={currentInstrument.name}
            instrumentKind={currentInstrument.kind}
            engine={currentInstrument.engine ?? "synth"}
            onChange={handleInstrumentChange}
          />
        )
        )}
        </div>
      </div>
      <MixerPanel
        tracks={project.tracks}
        selectedId={selectedTrackId}
        masterVolume={project.masterVolume ?? 0.9}
        onSelect={selectTrack}
        onUpdate={handleMixerUpdate}
        onMasterVolumeChange={handleMasterVolume}
      />
      </div>
    </>
  );
}
