import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bindSchedulerProject, scheduler } from "./audio/lookaheadScheduler";
import { initAudioGraph, onClockPosition } from "./audio/engine";
import { downloadBlob, encodeExport, safeFilename, type ExportFormat } from "./audio/export";
import { normalizeBuffer, renderProjectOffline } from "./audio/offlineRender";
import { GlobalTooltip } from "./components/GlobalTooltip";
import { MixerPanel } from "./components/Mixer/MixerPanel";
import { PianoRollCanvas } from "./components/PianoRoll/PianoRollCanvas";
import { PianoRollToolbar } from "./components/PianoRoll/PianoRollToolbar";
import { ProjectBrowser } from "./components/ProjectBrowser/ProjectBrowser";
import { SynthPanel } from "./components/Synth/SynthPanel";
import { TrackList } from "./components/TrackList/TrackList";
import { TransportBar } from "./components/Transport/TransportBar";
import { useEditorStore } from "./state/useEditorStore";
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
import type { Project, Track } from "./types/project";
import type { QuantizeGrid } from "./utils/quantize";
import { importMidiAsNewTrack, mergeMidiIntoProject, midiFilename, parseMidi, projectToMidi } from "./utils/midi";
import "./index.css";

const BEATS_VISIBLE = 32;
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
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const updateInstrumentForTrack = useProjectStore((s) => s.updateInstrumentForTrack);
  const touch = useProjectStore((s) => s.touch);

  const quantizeGrid = useEditorStore((s) => s.quantizeGrid);
  const setQuantizeGrid = useEditorStore((s) => s.setQuantizeGrid);

  const playing = useTransportStore((s) => s.playing);
  const playheadBeat = useTransportStore((s) => s.playheadBeat);
  const setPlaying = useTransportStore((s) => s.setPlaying);
  const setPlayheadBeat = useTransportStore((s) => s.setPlayheadBeat);

  const track = useSelectedTrack();
  const selectedNotes = useSelectedNotes();
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
  const clockUnsub = useRef<(() => void) | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTempo = useRef(project.tempo);
  const restored = useRef(false);

  const flushSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await saveProject(useProjectStore.getState().project);
  }, []);

  const currentInstrument = useMemo(() => {
    if (!track) return null;
    return project.instruments.find((i) => i.id === track.instrumentId) ?? null;
  }, [track, project.instruments]);

  const avgVelocity = useMemo(() => {
    if (selectedNotes.length === 0) return 100;
    return Math.round(
      selectedNotes.reduce((s, n) => s + n.velocity, 0) / selectedNotes.length
    );
  }, [selectedNotes]);

  useEffect(() => {
    bindSchedulerProject(() => useProjectStore.getState().project);
    void initAudioGraph().catch(() => {});
  }, []);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    void loadLatestProject().then((p) => {
      if (p) setProject(p);
      else if (project.tracks[0]) selectTrack(project.tracks[0].id);
    });
  }, [setProject, selectTrack, project.tracks]);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveProject(useProjectStore.getState().project);
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

  const handlePlay = useCallback(async () => {
    const { clock } = await initAudioGraph();
    clockUnsub.current?.();
    clockUnsub.current = onClockPosition(clock, (pos) => {
      if (useTransportStore.getState().playing) setPlayheadBeat(pos.beat);
    });
    setPlaying(true);
    await scheduler.start(useTransportStore.getState().playheadBeat);
  }, [setPlaying, setPlayheadBeat]);

  const handleStop = useCallback(async () => {
    clockUnsub.current?.();
    clockUnsub.current = null;
    await scheduler.stop();
    setPlaying(false);
  }, [setPlaying]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const p = useProjectStore.getState().project;
      const buf = renderProjectOffline(p);
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
        setProject(loaded);
        setProjectBrowserOpen(false);
      }
    },
    [flushSave, setProject, handleStop]
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
    newProject();
    const t = useProjectStore.getState().project.tracks[0];
    if (t) selectTrack(t.id);
    void saveProject(useProjectStore.getState().project);
  }, [newProject, selectTrack, handleStop, flushSave]);

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

  const handleAddNote = useCallback(
    (pitch: number, start: number) => {
      if (!track) return;
      addNote(track.id, {
        pitch,
        start,
        duration: Math.max(quantizeGrid, 0.125),
        velocity: 100,
      });
      touch();
    },
    [track, addNote, touch, quantizeGrid]
  );

  const handleDeleteSelected = useCallback(() => {
    if (!track || selectedNoteIds.size === 0) return;
    removeNotes(track.id, [...selectedNoteIds]);
    touch();
  }, [track, selectedNoteIds, removeNotes, touch]);

  const handleQuantize = useCallback(() => {
    if (!track || selectedNoteIds.size === 0) return;
    quantizeNotes(track.id, [...selectedNoteIds], quantizeGrid);
    touch();
  }, [track, selectedNoteIds, quantizeGrid, quantizeNotes, touch]);

  const handleVelocity = useCallback(
    (v: number) => {
      if (!track || selectedNoteIds.size === 0) return;
      setNotesVelocity(track.id, [...selectedNoteIds], v);
    },
    [track, selectedNoteIds, setNotesVelocity]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handleDeleteSelected();
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (useTransportStore.getState().playing) void handleStop();
        else void handlePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleDeleteSelected, handlePlay, handleStop]);

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
      <div className="app">
      <TransportBar
        projectName={project.name}
        playing={playing}
        exporting={exporting}
        exportFormat={exportFormat}
        helpOn={helpOn}
        tempo={project.tempo}
        playheadBeat={playheadBeat}
        loopStart={project.loopStart}
        loopEnd={project.loopEnd}
        onProjectNameChange={setProjectName}
        onOpenProjects={handleOpenProjects}
        onNewProject={() => void handleNewProject()}
        onPlay={() => void handlePlay()}
        onStop={() => void handleStop()}
        onExport={() => void handleExport()}
        onExportFormatChange={setExportFormat}
        onImportMidi={(f) => void handleImportMidi(f)}
        onExportMidi={handleExportMidi}
        onTempoChange={setTempo}
        onLoopStartChange={(v) => setLoop(v, project.loopEnd)}
        onLoopEndChange={(v) => setLoop(project.loopStart, v)}
        onHelpToggle={toggleHelp}
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
      <div className="app__workspace">
        <TrackList
          tracks={project.tracks}
          instruments={project.instruments}
          selectedId={selectedTrackId}
          onSelect={selectTrack}
          onAddTrack={addTrack}
          onRemoveTrack={removeTrack}
          onUpdateTrack={handleMixerUpdate}
        />
        <main className="piano-roll">
          <PianoRollToolbar
            quantizeGrid={quantizeGrid}
            onQuantizeGridChange={(g) => setQuantizeGrid(g as QuantizeGrid)}
            selectedCount={selectedNoteIds.size}
            velocity={avgVelocity}
            onVelocityChange={handleVelocity}
            onQuantize={handleQuantize}
            onDelete={handleDeleteSelected}
          />
          <PianoRollCanvas
            track={track}
            playheadBeat={playheadBeat}
            loopStart={project.loopStart}
            loopEnd={project.loopEnd}
            beatsVisible={BEATS_VISIBLE}
            quantizeGrid={quantizeGrid}
            selectedNoteIds={selectedNoteIds}
            onAddNote={handleAddNote}
            onSelectNotes={selectNotes}
            onToggleNote={toggleNoteSelection}
            onUpdateNotes={(updates) => updateNotes(track.id, updates)}
            onLoopChange={setLoop}
          />
        </main>
        {currentInstrument && (
          <SynthPanel
            params={currentInstrument.params}
            instrumentName={currentInstrument.name}
            instrumentKind={currentInstrument.kind}
            onChange={handleInstrumentChange}
          />
        )}
      </div>
      <MixerPanel
        tracks={project.tracks}
        selectedId={selectedTrackId}
        onSelect={selectTrack}
        onUpdate={handleMixerUpdate}
      />
      </div>
    </>
  );
}
