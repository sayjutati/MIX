import type { ExportFormat } from "../../audio/export";

type Props = {
  projectName: string;
  playing: boolean;
  exporting: boolean;
  exportFormat: ExportFormat;
  helpOn: boolean;
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
  onHelpToggle: () => void;
};

export function TransportBar({
  projectName,
  playing,
  exporting,
  exportFormat,
  helpOn,
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
  onHelpToggle,
}: Props) {
  const bar = Math.floor(playheadBeat / 4) + 1;
  const beat = Math.round((playheadBeat % 4) * 4);

  return (
    <header className="toolbar">
      <div className="toolbar__left">
        <span className="toolbar__brand">MIX DTM</span>
        <input
          className="toolbar__project-name tooltip"
          data-tooltip="プロジェクト名（自動保存されます）"
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
          aria-label="プロジェクト名"
          placeholder="無題"
        />
        <button
          type="button"
          className="btn btn--ghost tooltip"
          data-tooltip="保存済みプロジェクト一覧を開く"
          onClick={onOpenProjects}
        >
          一覧
        </button>
        <button
          type="button"
          className="btn btn--ghost tooltip"
          data-tooltip="新しいプロジェクトを作成（現在の内容は保存済み）"
          onClick={onNewProject}
        >
          新規
        </button>
        <div className="toolbar__divider" />
        <select
          className="toolbar__format tooltip"
          data-tooltip="書き出し形式（WAV=無圧縮 / MP3=配布向け）"
          value={exportFormat}
          onChange={(e) => onExportFormatChange(e.target.value as ExportFormat)}
          aria-label="書き出し形式"
        >
          <option value="wav">WAV — 無圧縮</option>
          <option value="mp3">MP3 — 圧縮</option>
        </select>
        <button
          type="button"
          className="btn btn--export tooltip"
          data-tooltip="全トラックをミックスして音声ファイルをダウンロード"
          onClick={onExport}
          disabled={exporting}
        >
          {exporting ? "書き出し中…" : "書き出し"}
        </button>
        <button
          type="button"
          className="btn btn--ghost tooltip"
          data-tooltip="MIDIファイル（.mid）としてダウンロード"
          onClick={onExportMidi}
        >
          MIDI↓
        </button>
        <label
          className="btn btn--ghost tooltip transport__midi-import"
          data-tooltip="MIDIファイルを読み込む（新規トラック or 選択トラックに追加）"
        >
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

      <div className="transport">
        {playing ? (
          <button
            type="button"
            className="transport__btn-stop tooltip"
            data-tooltip="停止（Space）"
            onClick={onStop}
            aria-label="停止"
          >
            ■
          </button>
        ) : (
          <button
            type="button"
            className="transport__btn-play tooltip"
            data-tooltip="再生（Space）"
            onClick={onPlay}
            aria-label="再生"
          >
            ▶
          </button>
        )}
        <div className="transport__divider" />
        <label className="toolbar__bpm tooltip" data-tooltip="テンポ（BPM）。再生中も変更できます">
          BPM
          <input
            type="number"
            min={20}
            max={300}
            value={tempo}
            onChange={(e) => onTempoChange(Number(e.target.value) || 120)}
          />
        </label>
        <div className="transport__divider" />
        <label className="transport__loop-field tooltip" data-tooltip="ループ再生の開始位置（拍）">
          開始
          <input
            type="number"
            min={0}
            step={0.25}
            value={loopStart}
            onChange={(e) => onLoopStartChange(Number(e.target.value) || 0)}
          />
        </label>
        <label className="transport__loop-field tooltip" data-tooltip="ループ再生の終了位置（拍）">
          終了
          <input
            type="number"
            min={0.25}
            step={0.25}
            value={loopEnd}
            onChange={(e) => onLoopEndChange(Number(e.target.value) || loopEnd)}
          />
        </label>
        <div className="transport__time tooltip" data-tooltip="現在の再生位置（小節.拍）">
          {bar}.{beat}
        </div>
      </div>

      <div className="toolbar__right">
        <span className="toolbar__hint">Space = 再生/停止</span>
        <div className="toolbar__divider" />
        <button
          type="button"
          className={`toolbar__icon tooltip${helpOn ? " toolbar__icon--on" : ""}`}
          data-tooltip={
            helpOn
              ? "機能説明ポップアップ：ON（クリックでOFF）"
              : "機能説明ポップアップ：OFF（クリックでON）"
          }
          onClick={onHelpToggle}
          aria-label="機能説明の表示切替"
        >
          ?
        </button>
      </div>
    </header>
  );
}
