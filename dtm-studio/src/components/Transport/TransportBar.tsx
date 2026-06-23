import type { ExportFormat } from "../../audio/export";

type Props = {
  projectName: string;
  playing: boolean;
  exporting: boolean;
  exportFormat: ExportFormat;
  tempo: number;
  playheadBeat: number;
  loopStart: number;
  loopEnd: number;
  onProjectNameChange: (name: string) => void;
  onOpenProjects: () => void;
  onNewProject: () => void;
  onPlay: () => void;
  onStop: () => void;
  onExport: () => void;
  onExportFormatChange: (format: ExportFormat) => void;
  onImportMidi: (file: File) => void;
  onExportMidi: () => void;
  onTempoChange: (tempo: number) => void;
  onLoopStartChange: (v: number) => void;
  onLoopEndChange: (v: number) => void;
};

export function TransportBar({
  projectName,
  playing,
  exporting,
  exportFormat,
  tempo,
  playheadBeat,
  loopStart,
  loopEnd,
  onProjectNameChange,
  onOpenProjects,
  onNewProject,
  onPlay,
  onStop,
  onExport,
  onExportFormatChange,
  onImportMidi,
  onExportMidi,
  onTempoChange,
  onLoopStartChange,
  onLoopEndChange,
}: Props) {
  return (
    <header className="transport">
      <div className="transport__brand">MIX DTM</div>
      <input
        className="transport__project-name"
        value={projectName}
        onChange={(e) => onProjectNameChange(e.target.value)}
        aria-label="プロジェクト名"
      />
      <button type="button" className="transport__btn transport__btn--ghost" onClick={onOpenProjects}>
        一覧
      </button>
      <button type="button" className="transport__btn transport__btn--ghost" onClick={onNewProject}>
        新規
      </button>
      <div className="transport__controls">
        {playing ? (
          <button type="button" className="transport__btn transport__btn--stop" onClick={onStop}>
            ■ Stop
          </button>
        ) : (
          <button type="button" className="transport__btn transport__btn--play" onClick={onPlay}>
            ▶ Play
          </button>
        )}
        <select
          className="transport__export-format"
          value={exportFormat}
          onChange={(e) => onExportFormatChange(e.target.value as ExportFormat)}
          aria-label="書き出し形式"
        >
          <option value="wav">WAV</option>
          <option value="mp3">MP3</option>
        </select>
        <button
          type="button"
          className="transport__btn transport__btn--export"
          onClick={onExport}
          disabled={exporting}
        >
          {exporting ? "書き出し中…" : "書き出し"}
        </button>
        <button type="button" className="transport__btn transport__btn--ghost" onClick={onExportMidi}>
          MIDI↓
        </button>
        <label className="transport__btn transport__btn--ghost transport__midi-import">
          MIDI↑
          <input
            type="file"
            accept=".mid,.midi,audio/midi"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportMidi(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <label className="transport__tempo">
        BPM
        <input
          type="number"
          min={20}
          max={300}
          value={tempo}
          onChange={(e) => onTempoChange(Number(e.target.value) || 120)}
        />
      </label>
      <div className="transport__loop-fields">
        <label>
          L in
          <input
            type="number"
            min={0}
            step={0.25}
            value={loopStart}
            onChange={(e) => onLoopStartChange(Number(e.target.value) || 0)}
          />
        </label>
        <label>
          L out
          <input
            type="number"
            min={0.25}
            step={0.25}
            value={loopEnd}
            onChange={(e) => onLoopEndChange(Number(e.target.value) || loopEnd)}
          />
        </label>
      </div>
      <div className="transport__info">
        <span>
          Bar {Math.floor(playheadBeat / 4) + 1}.{Math.round((playheadBeat % 4) * 4)}
        </span>
        <span className="transport__hint">Space = Play/Stop</span>
      </div>
    </header>
  );
}
