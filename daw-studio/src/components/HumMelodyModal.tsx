import { useCallback, useEffect, useRef, useState } from "react";
import { audioBufferToWav } from "../audio/mixdown";
import { detectNotesAsync } from "../audio/pitchDetectClient";
import {
  inferKey,
  quantizeMelodyNotes,
  renderMelodySynth,
  snapMelodyToKey,
  type KeyGuess,
} from "../audio/humToMelody";
import { bufferToMono, midiToName } from "../audio/pitch";
import { createMediaRecorder, createMicStream } from "../audio/recording";
import { DEFAULT_MELODY_VOICE, MELODY_VOICES, type MelodyVoiceId, type PitchNote } from "../types";

export type HumMelodyResult = {
  wav: Blob;
  notes: PitchNote[];
  duration: number;
  keyName: string;
  voice: MelodyVoiceId;
};

type Props = {
  open: boolean;
  bpm: number;
  clipUrl?: string | null;
  onClose: () => void;
  onCreate: (result: HumMelodyResult) => void;
};

type Phase = "pick" | "recording" | "analyzing" | "ready";

const MAX_SEC = 40;

export function HumMelodyModal({ open, bpm, clipUrl, onClose, onCreate }: Props) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [rawNotes, setRawNotes] = useState<PitchNote[]>([]);
  const [gridBeats, setGridBeats] = useState(0.25);
  const [scaleSnap, setScaleSnap] = useState(true);
  const [voice, setVoice] = useState<MelodyVoiceId>(DEFAULT_MELODY_VOICE);
  const [busy, setBusy] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef(0);

  const stopMic = useCallback(() => {
    window.clearInterval(timerRef.current);
    recRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    setPhase("pick");
    setError(null);
    setRawNotes([]);
    setElapsed(0);
    return () => stopMic();
  }, [open, stopMic]);

  const analyzeBuffer = useCallback(async (buf: AudioBuffer) => {
    setPhase("analyzing");
    setError(null);
    try {
      if (buf.duration < 0.3) throw new Error("録音が短すぎます（0.3 秒以上）");
      const notes = await detectNotesAsync(bufferToMono(buf), buf.sampleRate);
      if (!notes.length) throw new Error("音程を検出できませんでした。もう少しはっきりハミングしてください。");
      setRawNotes(notes);
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "解析に失敗しました");
      setPhase("pick");
    }
  }, []);

  const analyzeBytes = useCallback(
    async (bytes: ArrayBuffer, fail = "音声の読み込みに失敗しました") => {
      setPhase("analyzing");
      try {
        const ctx = new AudioContext();
        const buf = await ctx.decodeAudioData(bytes.slice(0));
        void ctx.close();
        await analyzeBuffer(buf);
      } catch {
        setError(fail);
        setPhase("pick");
      }
    },
    [analyzeBuffer]
  );

  const analyzeUrl = useCallback(
    async (url: string) => {
      try {
        await analyzeBytes(await (await fetch(url)).arrayBuffer(), "クリップの読み込みに失敗しました");
      } catch {
        setError("クリップの読み込みに失敗しました");
        setPhase("pick");
      }
    },
    [analyzeBytes]
  );

  const startRec = useCallback(async () => {
    setError(null);
    try {
      const stream = await createMicStream();
      streamRef.current = stream;
      const rec = createMediaRecorder(stream);
      recRef.current = rec;
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = async () => {
        stopMic();
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        try {
          const ctx = new AudioContext();
          const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
          void ctx.close();
          await analyzeBuffer(buf);
        } catch {
          setError("録音データの解析に失敗しました");
          setPhase("pick");
        }
      };
      rec.start(200);
      setPhase("recording");
      const t0 = Date.now();
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        const sec = (Date.now() - t0) / 1000;
        setElapsed(sec);
        if (sec >= MAX_SEC && rec.state === "recording") rec.stop();
      }, 100);
    } catch {
      setError("マイクを使えませんでした。ブラウザの許可を確認してください。");
      stopMic();
    }
  }, [analyzeBuffer, stopMic]);

  const cooked = (() => {
    let notes = quantizeMelodyNotes(rawNotes, bpm, gridBeats);
    const key: KeyGuess = inferKey(notes.length ? notes : rawNotes);
    if (scaleSnap) notes = snapMelodyToKey(notes, key);
    return { notes, key };
  })();

  const create = async () => {
    if (!cooked.notes.length || busy) return;
    setBusy(true);
    try {
      const buf = await renderMelodySynth(cooked.notes, 44100, voice);
      onCreate({
        wav: audioBufferToWav(buf),
        notes: cooked.notes,
        duration: buf.duration,
        keyName: cooked.key.name,
        voice,
      });
    } catch {
      setError("メロディの書き出しに失敗しました");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="hum-modal" onClick={onClose} role="presentation">
      <div className="hum-modal__card" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="hum-title">
        <div className="hum-modal__head">
          <h2 id="hum-title">鼻歌 → メロディ</h2>
          <button type="button" className="hum-modal__x" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>
        <p className="hum-modal__lead">
          ハミングを端末内でノート化し、ピアノ音のトラックにします。クラウドには送りません。
        </p>

        {phase === "pick" && (
          <div className="hum-modal__actions">
            <button type="button" className="btn btn--primary" onClick={() => void startRec()}>
              ● 鼻歌を録音
            </button>
            {clipUrl ? (
              <button type="button" className="btn btn--ghost" onClick={() => void analyzeUrl(clipUrl)}>
                選択中のクリップから起こす
              </button>
            ) : null}
            <label className="btn btn--ghost">
              ファイルから起こす
              <input
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void f.arrayBuffer().then((b) => analyzeBytes(b, "ファイルの読み込みに失敗しました"));
                }}
              />
            </label>
          </div>
        )}

        {phase === "recording" && (
          <div className="hum-modal__rec">
            <p>
              録音中… {elapsed.toFixed(1)}s / {MAX_SEC}s
            </p>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => recRef.current?.state === "recording" && recRef.current.stop()}
            >
              ■ 停止して解析
            </button>
          </div>
        )}

        {phase === "analyzing" && <p className="hum-modal__hint">音程を解析しています…</p>}

        {phase === "ready" && (
          <div className="hum-modal__ready">
            <p>
              検出 <strong>{cooked.notes.length}</strong> 音 · 推定キー{" "}
              <strong>{cooked.key.name}</strong>
            </p>
            <div className="hum-modal__roll" aria-hidden>
              {cooked.notes.slice(0, 24).map((n) => (
                <span key={n.id} className="hum-modal__chip">
                  {midiToName(n.midi)}
                </span>
              ))}
              {cooked.notes.length > 24 && <span className="hum-modal__chip">…</span>}
            </div>
            <label className="hum-modal__field">
              クオンタイズ
              <select value={gridBeats} onChange={(e) => setGridBeats(Number(e.target.value))}>
                <option value={0}>なし</option>
                <option value={0.5}>8分</option>
                <option value={0.25}>16分</option>
              </select>
            </label>
            <label className="hum-modal__check">
              <input type="checkbox" checked={scaleSnap} onChange={(e) => setScaleSnap(e.target.checked)} />
              キーに合わせて半音を整える
            </label>
            <div className="voice-picks" role="group" aria-label="音色">
              {MELODY_VOICES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`voice-picks__btn${voice === v.id ? " is-on" : ""}`}
                  onClick={() => setVoice(v.id)}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div className="hum-modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => { setRawNotes([]); setPhase("pick"); }}>
                やり直す
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!cooked.notes.length || busy}
                onClick={() => void create()}
              >
                {busy ? "作成中…" : "メロディトラックを追加"}
              </button>
            </div>
          </div>
        )}

        {error && <p className="hum-modal__err">{error}</p>}
      </div>
    </div>
  );
}
