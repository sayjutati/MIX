import { useCallback, useEffect, useRef, useState } from "react";
import {
  createMicStream,
  listMicDevices,
  recordToBlob,
} from "../../audio/recording";

type Props = {
  recording: boolean;
  onRecordingChange: (v: boolean) => void;
  onImportFiles: (files: File[]) => void;
  onRecorded: (blob: Blob, name: string) => void;
};

export function AudioPanel({
  recording,
  onRecordingChange,
  onImportFiles,
  onRecorded,
}: Props) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const recordPromiseRef = useRef<Promise<Blob> | null>(null);

  useEffect(() => {
    void listMicDevices().then(setDevices);
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await createMicStream(deviceId || undefined);
      streamRef.current = stream;
      recordPromiseRef.current = recordToBlob(stream);
      onRecordingChange(true);
    } catch {
      alert("マイクへのアクセスが拒否されました。ブラウザの権限を確認してください。");
    }
  }, [deviceId, onRecordingChange]);

  const stopRecording = useCallback(async () => {
    stopStream();
    onRecordingChange(false);
    const task = recordPromiseRef.current;
    recordPromiseRef.current = null;
    if (!task) return;
    try {
      const blob = await task;
      if (blob.size > 0) {
        onRecorded(blob, `録音 ${new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`);
      }
    } catch {
      alert("録音の保存に失敗しました。");
    }
  }, [onRecordingChange, onRecorded, stopStream]);

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
        <label className="audio-panel__device tooltip" data-tooltip="録音入力デバイス（マイク・外部音源）">
          入力
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
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
            data-tooltip="再生位置から録音（マイク / ライン入力）"
            onClick={() => void startRecording()}
          >
            ● 録音
          </button>
        ) : (
          <button
            type="button"
            className="audio-panel__rec audio-panel__rec--on tooltip"
            data-tooltip="録音停止してクリップに追加"
            onClick={() => void stopRecording()}
          >
            ■ 停止
          </button>
        )}
      </div>
      <p className="audio-panel__hint">
        ドラッグ＆ドロップでも取込可 · 外部 AudioWorklet（.js）プラグインは右の FX パネルから
      </p>
    </div>
  );
}
