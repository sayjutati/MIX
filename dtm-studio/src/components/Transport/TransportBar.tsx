import { useState } from "react";
import type { ExportFormat } from "../../audio/export";
import { beatToDisplaySec, formatBeatPosition, formatTime, secToBeat } from "../../utils/time";

type Props = {
  projectName: string;
  playing: boolean;
  exporting: boolean;
  exportFormat: ExportFormat;
  helpOn: boolean;
  tempo: number;
  playheadBeat: number;
  loopEnabled: boolean;
  showBarsBeats: boolean;
  loopStart: number;
  loopEnd: number;
  onProjectNameChange: (name: string) => void;
  onOpenProjects: () => void;
  onNewProject: () => void;
  onPlay: () => void;
  onStop: () => void;
  onSeekBeat: (beat: number) => void;
  onExport: () => void;
  onExportFormatChange: (format: ExportFormat) => void;
  onImportMidi: (file: File) => void;
  onExportMidi: () => void;
  onTempoChange: (tempo: number) => void;
  onLoopEnabledChange: (v: boolean) => void;
  onShowBarsBeatsChange: (v: boolean) => void;
  onLoopStartChange: (v: number) => void;
  onLoopEndChange: (v: number) => void;
  onHelpToggle: () => void;
  metronomeOn: boolean;
  onMetronomeChange: (v: boolean) => void;
};

export function TransportBar({
  projectName,
  playing,
  exporting,
  exportFormat,
  helpOn,
  tempo,
  playheadBeat,
  loopEnabled,
  showBarsBeats,
  loopStart,
  loopEnd,
  onProjectNameChange,
  onOpenProjects,
  onNewProject,
  onPlay,
  onStop,
  onSeekBeat,
  onExport,
  onExportFormatChange,
  onImportMidi,
  onExportMidi,
  onTempoChange,
  onLoopEnabledChange,
  onShowBarsBeatsChange,
  onLoopStartChange,
  onLoopEndChange,
  onHelpToggle,
  metronomeOn,
  onMetronomeChange,
}: Props) {
  const displaySec = beatToDisplaySec(playheadBeat, tempo);
  const timeLabel = showBarsBeats
    ? formatBeatPosition(playheadBeat, tempo)
    : formatTime(displaySec);

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
        <button
          type="button"
          className="transport__btn-ghost tooltip"
          data-tooltip="最初に戻る"
          onClick={() => onSeekBeat(0)}
          aria-label="最初に戻る"
        >
          ⏮
        </button>
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
        <TransportTime
          playing={playing}
          tempo={tempo}
          showBarsBeats={showBarsBeats}
          timeLabel={timeLabel}
          displaySec={displaySec}
          onSeekBeat={onSeekBeat}
        />
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
        <button
          type="button"
          className={`transport__btn-ghost tooltip${loopEnabled ? " transport__btn-ghost--on" : ""}`}
          data-tooltip="ループ再生 ON/OFF（A〜B区間を繰り返す・Lキー）"
          onClick={() => onLoopEnabledChange(!loopEnabled)}
          aria-label="ループ"
        >
          🔁
        </button>
        <button
          type="button"
          className="transport__ab tooltip"
          data-tooltip="ループ始点(A)を再生位置に設定"
          onClick={() => {
            onLoopStartChange(playheadBeat);
            if (playheadBeat >= loopEnd) onLoopEndChange(playheadBeat + 4);
            onLoopEnabledChange(true);
          }}
        >
          A
        </button>
        <button
          type="button"
          className="transport__ab tooltip"
          data-tooltip="ループ終点(B)を再生位置に設定"
          onClick={() => {
            onLoopEndChange(Math.max(playheadBeat, loopStart + 0.25));
            onLoopEnabledChange(true);
          }}
        >
          B
        </button>
        <label className="transport__loop-field tooltip" data-tooltip="ループ開始（拍）">
          開始
          <input
            type="number"
            min={0}
            step={0.25}
            value={loopStart}
            onChange={(e) => onLoopStartChange(Number(e.target.value) || 0)}
          />
        </label>
        <label className="transport__loop-field tooltip" data-tooltip="ループ終了（拍）">
          終了
          <input
            type="number"
            min={0.25}
            step={0.25}
            value={loopEnd}
            onChange={(e) => onLoopEndChange(Number(e.target.value) || loopEnd)}
          />
        </label>
        <button
          type="button"
          className={`transport__btn-ghost tooltip${metronomeOn ? " transport__btn-ghost--on" : ""}`}
          data-tooltip="メトロノーム（Mキー）"
          onClick={() => onMetronomeChange(!metronomeOn)}
          aria-label="メトロノーム"
        >
          ♩
        </button>
      </div>

      <div className="toolbar__right">
        <button
          type="button"
          className={`toolbar__icon tooltip${showBarsBeats ? " toolbar__icon--on" : ""}`}
          data-tooltip={
            showBarsBeats ? "表示：小節.拍（クリックで秒に）" : "表示：秒（クリックで小節.拍に）"
          }
          onClick={() => onShowBarsBeatsChange(!showBarsBeats)}
          aria-label="時間表示切替"
        >
          ⏱
        </button>
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

function TransportTime({
  playing,
  tempo,
  showBarsBeats,
  timeLabel,
  displaySec,
  onSeekBeat,
}: {
  playing: boolean;
  tempo: number;
  showBarsBeats: boolean;
  timeLabel: string;
  displaySec: number;
  onSeekBeat: (beat: number) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing && !playing) {
    return (
      <div className="transport__time tooltip" data-tooltip="秒数を入力して Enter">
        <input
          type="number"
          step={0.1}
          min={0}
          defaultValue={displaySec.toFixed(1)}
          autoFocus
          onBlur={(e) => {
            setEditing(false);
            const v = parseFloat(e.currentTarget.value);
            if (!Number.isNaN(v)) onSeekBeat(secToBeat(Math.max(0, v), tempo));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="transport__time tooltip"
      data-tooltip={
        showBarsBeats ? "小節.拍.補助（停止中クリックで秒入力）" : "分:秒（停止中クリックで秒入力）"
      }
      onClick={() => {
        if (!playing) setEditing(true);
      }}
    >
      {timeLabel}
    </div>
  );
}
