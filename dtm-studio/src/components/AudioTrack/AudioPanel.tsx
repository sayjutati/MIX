import { useEffect, useState } from "react";
import { listMicDevices } from "../../audio/recording";

type Props = {
  recording: boolean;
  deviceId: string;
  onDeviceIdChange: (id: string) => void;
  onImportFiles: (files: File[]) => void;
  onStartRecord: () => void;
  onStopRecord: () => void;
};

export function AudioPanel({
  recording,
  deviceId,
  onDeviceIdChange,
  onImportFiles,
  onStartRecord,
  onStopRecord,
}: Props) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void listMicDevices().then(setDevices);
  }, []);

  return (
    <div className="audio-panel">
      <div className="audio-panel__row">
        <label className="audio-panel__import tooltip" data-tooltip="WAV / MP3 / OGG 等を取り込み">
          ファイル取込
          <input
            type="file"
            accept="audio/*,.wav,.mp3,.ogg,.m4a,.flac,.webm"
            multiple
            hidden
            onChange={(e) => {
              const files = e.target.files;
              if (files?.length) onImportFiles(Array.from(files));
              e.target.value = "";
            }}
          />
        </label>
        <label className="audio-panel__device tooltip" data-tooltip="録音入力（マイク・外部音源）">
          入力
          <select value={deviceId} onChange={(e) => onDeviceIdChange(e.target.value)}>
            <option value="">デフォルト</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `入力 ${d.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </label>
        {!recording ? (
          <button
            type="button"
            className="audio-panel__rec tooltip"
            data-tooltip="再生位置から録音（R キー / トランスポートの ●）"
            onClick={() => {
              setError("");
              onStartRecord();
            }}
          >
            ● 録音
          </button>
        ) : (
          <button
            type="button"
            className="audio-panel__rec audio-panel__rec--on"
            onClick={onStopRecord}
          >
            ■ 停止
          </button>
        )}
      </div>
      {error && <p className="audio-panel__error">{error}</p>}
      <p className="audio-panel__hint">
        上へドラッグ＆ドロップ · タイムラインでクリップを移動 · 右クリックで削除
      </p>
    </div>
  );
}
