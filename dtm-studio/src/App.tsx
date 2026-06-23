import { useCallback, useEffect, useRef, useMemo } from "react";

import { bindSchedulerProject, scheduler } from "./audio/lookaheadScheduler";

import { initAudioGraph, onClockPosition } from "./audio/engine";

import { MixerPanel } from "./components/Mixer/MixerPanel";

import { PianoRollCanvas } from "./components/PianoRoll/PianoRollCanvas";

import { PianoRollToolbar } from "./components/PianoRoll/PianoRollToolbar";

import { TrackList } from "./components/TrackList/TrackList";

import { TransportBar } from "./components/Transport/TransportBar";

import { useEditorStore } from "./state/useEditorStore";

import {

  useProjectStore,

  useSelectedNotes,

  useSelectedTrack,

} from "./state/useProjectStore";

import { useTransportStore } from "./state/useTransportStore";

import { saveProject } from "./storage/projectStorage";

import type { QuantizeGrid } from "./utils/quantize";

import "./index.css";



const BEATS_VISIBLE = 32;



export default function App() {

  const project = useProjectStore((s) => s.project);

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

  const addTrack = useProjectStore((s) => s.addTrack);

  const removeTrack = useProjectStore((s) => s.removeTrack);

  const updateTrack = useProjectStore((s) => s.updateTrack);

  const touch = useProjectStore((s) => s.touch);



  const quantizeGrid = useEditorStore((s) => s.quantizeGrid);

  const setQuantizeGrid = useEditorStore((s) => s.setQuantizeGrid);



  const playing = useTransportStore((s) => s.playing);

  const playheadBeat = useTransportStore((s) => s.playheadBeat);

  const setPlaying = useTransportStore((s) => s.setPlaying);

  const setPlayheadBeat = useTransportStore((s) => s.setPlayheadBeat);



  const track = useSelectedTrack();

  const selectedNotes = useSelectedNotes();

  const clockUnsub = useRef<(() => void) | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);



  const avgVelocity = useMemo(() => {

    if (selectedNotes.length === 0) return 100;

    return Math.round(

      selectedNotes.reduce((s, n) => s + n.velocity, 0) / selectedNotes.length

    );

  }, [selectedNotes]);



  useEffect(() => {

    bindSchedulerProject(() => useProjectStore.getState().project);

    void initAudioGraph().catch(() => {});

    if (!selectedTrackId && project.tracks[0]) {

      selectTrack(project.tracks[0].id);

    }

  }, [project.tracks, selectTrack, selectedTrackId]);



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



  const handlePlay = useCallback(async () => {

    const { clock } = await initAudioGraph();

    clockUnsub.current?.();

    clockUnsub.current = onClockPosition(clock, (pos) => {

      if (useTransportStore.getState().playing) {

        setPlayheadBeat(pos.beat);

      }

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



  const handleAddNote = useCallback(

    (pitch: number, start: number) => {

      if (!track) return;

      addNote(track.id, { pitch, start, duration: Math.max(quantizeGrid, 0.125), velocity: 100 });

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

    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);

  }, [handleDeleteSelected]);



  if (!track) {

    return <div className="app app--empty">No tracks</div>;

  }



  return (

    <div className="app">

      <TransportBar

        playing={playing}

        tempo={project.tempo}

        playheadBeat={playheadBeat}

        loopStart={project.loopStart}

        loopEnd={project.loopEnd}

        onPlay={() => void handlePlay()}

        onStop={() => void handleStop()}

        onTempoChange={setTempo}

      />

      <div className="app__workspace">

        <TrackList

          tracks={project.tracks}

          instruments={project.instruments}

          selectedId={selectedTrackId}

          onSelect={selectTrack}

          onAddTrack={addTrack}

          onRemoveTrack={removeTrack}

          onUpdateTrack={updateTrack}

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

            onUpdateNotes={(updates) => {

              updateNotes(track.id, updates);

            }}

          />

        </main>

      </div>

      <MixerPanel

        tracks={project.tracks}

        selectedId={selectedTrackId}

        onSelect={selectTrack}

        onUpdate={updateTrack}

      />

    </div>

  );

}


