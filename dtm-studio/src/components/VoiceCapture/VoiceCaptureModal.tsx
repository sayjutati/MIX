import { useCallback, useEffect, useRef, useState } from "react";
import { createMicStream, createMediaRecorder, listMicDevices } from "../../audio/recording";
import { getAudioContext } from "../../audio/engine";
import { decodeAudioBlob } from "../../audio/decode";
import { analyzePitch, type PitchFrame, freqToMidiFloat } from "../../utils/pitchDetect";
import {
  estimateRootPitch,
  extractMelodyNotes,
  type ExtractedNote,
} from "../../utils/melodyExtract";
import { pitchJaName } from "../../utils/pitchLabel";

export type VoiceCaptureResult = {
  blob: Blob;
  name: string;
  rootPitch: number;
  notes: ExtractedNote[];
  useSampler: boolean;
  useNotes: boolean;
};

type Props = {
  open: boolean;
  tempo: number;
  onClose: () => void;
  onCreate: (result: VoiceCaptureResult) => void;
};

type Phase = "idle" | "recording" | "analyzing" | "ready";

const MAX_RECORD_SEC = 30;

const QUANT_OPTIONS = [
  { label: "なし（そのまま）", value: 0 },
  { label: "8分音符", value: 0.5 },
  { label: "16分音符", value: 0.25 },
] as const;

export function VoiceCaptureModal({ open, tempo, onClose, onCreate }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [frames, setFrames] = useState<PitchFrame[] | null>(null);
  const [notes, setNotes] = useState<ExtractedNote[]>([]);
  const [rootPitch, setRootPitch] = useState<number | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [quantGrid, setQuantGrid] = useState(0.25);
  const [name, setName] = useState("自分");
  const [useSampler, setUseSampler] = useState(true);
  const [useNotes, setUseNotes] = useState(true);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const rafRef = useRef(0);
  const timerRef = useRef(0);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const analyserCleanupRef = useRef<(() => void) | null>(null);

  const stopStream = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    window.clearInterval(timerRef.current);
    analyserCleanupRef.current?.();
    analyserCleanupRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const reset = useCallback(() => {
    stopStream();
    setPhase("idle");
    setError(null);
    setBlob(null);
    setFrames(null);
    setNotes([]);
    setRootPitch(null);
    setElapsed(0);
    setAudioUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  }, [stopStream]);

  useEffect(() => {
    if (!open) return;
    void listMicDevices().then(setDevices);
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** 録音停止後: デコード → ピッチ解析 */
  const analyzeBlob = useCallback(async (b: Blob) => {
    setPhase("analyzing");
    setError(null);
    try {
      const ctx = await getAudioContext();
      const buffer = await decodeAudioBlob(b, ctx);
      if (buffer.duration < 0.25) {
        setError("録音が短すぎます（0.25 秒以上必要）");
        setPhase("idle");
        return;
      }
      const mono = new Float32Array(buffer.length);
      const chs = buffer.numberOfChannels;
      for (let c = 0; c < chs; c++) {
        const ch = buffer.getChannelData(c);
        for (let i = 0; i < ch.length; i++) mono[i] += ch[i]! / chs;
      }
      const fr = analyzePitch(mono, buffer.sampleRate);
      setFrames(fr);
      setRootPitch(estimateRootPitch(fr));
      setDurationSec(buffer.duration);
      setBlob(b);
      setAudioUrl((url) => {
        if (url) URL.revokeObjectURL(url);
        return URL.createObjectURL(b);
      });
      setPhase("ready");
    } catch {
      setError("音声の解析に失敗しました。別のマイク・ファイルで試してください。");
      setPhase("idle");
    }
  }, []);

  /** クオンタイズ設定・フレームからノート再計算 */
  useEffect(() => {
    if (!frames) return;
    setNotes(extractMelodyNotes(frames, { tempo, quantGrid }));
  }, [frames, quantGrid, tempo]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await createMicStream(deviceId || undefined);
      streamRef.current = stream;
      const rec = createMediaRecorder(stream);
      recorderRef.current = rec;
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        const b = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        stopStream();
        void analyzeBlob(b);
      };
      rec.start(100);
      setPhase("recording");

      // 経過時間 + 上限で自動停止
      const startedAt = Date.now();
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        const sec = (Date.now() - startedAt) / 1000;
        setElapsed(sec);
        if (sec >= MAX_RECORD_SEC && rec.state === "recording") rec.stop();
      }, 100);

      // ライブ波形
      const ctx = await getAudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      analyserCleanupRef.current = () => {
        src.disconnect();
        analyser.disconnect();
      };
      const buf = new Float32Array(analyser.fftSize);
      const draw = () => {
        const canvas = liveCanvasRef.current;
        if (!canvas) return;
        const g = canvas.getContext("2d");
        if (!g) return;
        analyser.getFloatTimeDomainData(buf);
        const { width, height } = canvas;
        g.clearRect(0, 0, width, height);
        g.strokeStyle = "#34d399";
        g.lineWidth = 1.5;
        g.beginPath();
        for (let i = 0; i < buf.length; i++) {
          const x = (i / buf.length) * width;
          const y = height / 2 - buf[i]! * height * 0.45;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
        rafRef.current = requestAnimationFrame(draw);
      };
      rafRef.current = requestAnimationFrame(draw);
    } catch {
      setError("マイクにアクセスできませんでした。ブラウザの許可設定を確認してください。");
      setPhase("idle");
      stopStream();
    }
  }, [deviceId, stopStream, analyzeBlob]);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") rec.stop();
    else stopStream();
  }, [stopStream]);

  const onFilePicked = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      setName(file.name.replace(/\.[^.]+$/, "") || "自分");
      void analyzeBlob(file);
    },
    [analyzeBlob]
  );

  /** 検出結果プレビュー（ピッチ曲線 + ノート） */
  useEffect(() => {
    if (phase !== "ready" || !frames) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    const { width, height } = canvas;
    g.clearRect(0, 0, width, height);
    g.fillStyle = "#12121a";
    g.fillRect(0, 0, width, height);

    let minP = 48;
    let maxP = 72;
    if (notes.length > 0) {
      minP = Math.min(...notes.map((n) => n.pitch)) - 3;
      maxP = Math.max(...notes.map((n) => n.pitch)) + 3;
    } else {
      const voiced = frames.filter((f) => f.freq > 0);
      if (voiced.length > 0) {
        const ms = voiced.map((f) => freqToMidiFloat(f.freq));
        minP = Math.floor(Math.min(...ms)) - 3;
        maxP = Math.ceil(Math.max(...ms)) + 3;
      }
    }
    const span = Math.max(6, maxP - minP);
    const yOf = (midi: number) => height - ((midi - minP) / span) * height;
    const totalBeats = Math.max(0.001, (durationSec * tempo) / 60);
    const xOfBeat = (beat: number) => (beat / totalBeats) * width;
    const xOfSec = (sec: number) => (sec / durationSec) * width;

    // 拍グリッド
    g.strokeStyle = "rgba(255,255,255,0.07)";
    g.lineWidth = 1;
    for (let b = 0; b <= totalBeats; b++) {
      const x = xOfBeat(b);
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, height);
      g.stroke();
    }

    // ピッチ曲線
    g.fillStyle = "rgba(148, 163, 184, 0.55)";
    for (const f of frames) {
      if (f.freq <= 0) continue;
      g.fillRect(xOfSec(f.timeSec), yOf(freqToMidiFloat(f.freq)) - 1, 2, 2);
    }

    // 検出ノート
    const rowH = Math.max(4, height / span);
    for (const n of notes) {
      const x = xOfBeat(n.start);
      const w = Math.max(3, xOfBeat(n.start + n.duration) - x - 1);
      const y = yOf(n.pitch) - rowH / 2;
      g.fillStyle = "rgba(79, 140, 247, 0.85)";
      g.beginPath();
      g.roundRect(x, y, w, rowH, 2);
      g.fill();
    }
  }, [phase, frames, notes, durationSec, tempo]);

  const submit = useCallback(() => {
    if (!blob) return;
    onCreate({
      blob,
      name: name.trim() || "自分",
      rootPitch: Math.round(rootPitch ?? 57),
      notes,
      useSampler,
      useNotes,
    });
  }, [blob, name, rootPitch, notes, useSampler, useNotes, onCreate]);

  if (!open) return null;

  const canCreate =
    phase === "ready" && (useSampler || (useNotes && notes.length > 0));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="voice-capture" onClick={(e) => e.stopPropagation()}>
        <div className="voice-capture__head">
          <span className="voice-capture__title">声から音源・メロディを作成</span>
          <button type="button" className="voice-capture__close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>

        {phase !== "ready" && (
          <p className="voice-capture__lead">
            歌やハミングを録音すると、音程を自動解析してピアノロールのノートに起こせます。
            録音そのものをピッチシフトして鳴らすサンプラー音源「自分」も作れます。
          </p>
        )}

        {(phase === "idle" || phase === "analyzing") && (
          <div className="voice-capture__setup">
            <label className="voice-capture__field">
              マイク
              <select
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                disabled={phase === "analyzing"}
              >
                <option value="">既定のマイク</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || "マイク"}
                  </option>
                ))}
              </select>
            </label>
            <div className="voice-capture__setup-actions">
              <button
                type="button"
                className="voice-capture__record-btn"
                onClick={startRecording}
                disabled={phase === "analyzing"}
              >
                ● 録音開始
              </button>
              <label className="voice-capture__file-btn">
                ファイルから
                <input
                  type="file"
                  accept="audio/*"
                  hidden
                  onChange={(e) => onFilePicked(e.target.files?.[0])}
                />
              </label>
            </div>
            {phase === "analyzing" && <p className="voice-capture__status">解析中…</p>}
          </div>
        )}

        {phase === "recording" && (
          <div className="voice-capture__recording">
            <canvas ref={liveCanvasRef} width={560} height={90} className="voice-capture__wave" />
            <div className="voice-capture__rec-row">
              <span className="voice-capture__rec-time">
                ● {elapsed.toFixed(1)}s / 最大 {MAX_RECORD_SEC}s
              </span>
              <button type="button" className="voice-capture__stop-btn" onClick={stopRecording}>
                ■ 停止して解析
              </button>
            </div>
          </div>
        )}

        {phase === "ready" && (
          <div className="voice-capture__result">
            <canvas
              ref={previewCanvasRef}
              width={560}
              height={160}
              className="voice-capture__preview"
            />
            <div className="voice-capture__meta">
              <span>
                検出ノート: <strong>{notes.length}個</strong>
              </span>
              <span>
                代表音高:{" "}
                <strong>{rootPitch != null ? pitchJaName(Math.round(rootPitch)) : "—"}</strong>
              </span>
              <span>長さ: {durationSec.toFixed(1)}s</span>
              {audioUrl && <audio controls src={audioUrl} className="voice-capture__audio" />}
            </div>

            <div className="voice-capture__options">
              <label className="voice-capture__field">
                クオンタイズ
                <select
                  value={quantGrid}
                  onChange={(e) => setQuantGrid(Number(e.target.value))}
                >
                  {QUANT_OPTIONS.map((q) => (
                    <option key={q.value} value={q.value}>
                      {q.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="voice-capture__field">
                名前
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
            </div>

            <div className="voice-capture__checks">
              <label className="voice-capture__check">
                <input
                  type="checkbox"
                  checked={useSampler}
                  onChange={(e) => setUseSampler(e.target.checked)}
                />
                録音を音源「{name.trim() || "自分"}」として使う（鍵盤でピッチシフト再生）
              </label>
              <label className="voice-capture__check">
                <input
                  type="checkbox"
                  checked={useNotes}
                  onChange={(e) => setUseNotes(e.target.checked)}
                />
                検出したメロディをノートに起こす（{notes.length}個）
              </label>
            </div>

            <div className="voice-capture__actions">
              <button type="button" className="voice-capture__retry" onClick={reset}>
                録り直す
              </button>
              <button
                type="button"
                className="voice-capture__create"
                disabled={!canCreate}
                onClick={submit}
              >
                トラックを作成
              </button>
            </div>
          </div>
        )}

        {error && <p className="voice-capture__error">{error}</p>}
      </div>
    </div>
  );
}
