import { describe, expect, it } from "vitest";
import { setSample } from "./sampleBank";
import { createVoice, processVoiceEnv, triggerVoice, voiceSample } from "./synthCore";
import { detectPitchYin } from "../utils/pitchDetect";

const SR = 44100;

describe("サンプラー音源（voice）", () => {
  it("登録サンプルをピッチシフトして再生する", () => {
    // 440Hz のサイン波サンプル（1秒、ループ付き）
    const data = new Float32Array(SR);
    for (let i = 0; i < SR; i++) data[i] = 0.8 * Math.sin((2 * Math.PI * 440 * i) / SR);
    setSample("test-voice", {
      data,
      sampleRate: SR,
      rootHz: 440,
      loopStart: Math.floor(SR * 0.25),
      loopEnd: Math.floor(SR * 0.75),
    });

    const v = createVoice();
    triggerVoice(v, {
      startSec: 0,
      endSec: 2,
      pitch: 81, // A5 = 880Hz → 2倍速再生
      velocity: 100,
      waveform: "sine",
      adsr: { attack: 0.001, decay: 0.05, sustain: 1, release: 0.05 },
      pan: 0,
      volume: 1,
      sampleId: "test-voice",
    });

    // 2秒分レンダリング（ループを複数回通過）して出力を収集
    const out = new Float32Array(SR * 2);
    for (let i = 0; i < out.length; i++) {
      const t = i / SR;
      processVoiceEnv(v, 1 / SR, t);
      const s = voiceSample(v, SR, t);
      out[i] = s.l + s.r;
    }

    let peak = 0;
    for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]!));
    expect(peak).toBeGreaterThan(0.1);

    // 定常部の周波数が 880Hz 付近（ピッチシフトが正しい）
    const frame = out.subarray(SR, SR + 2048);
    const { freq } = detectPitchYin(new Float32Array(frame), SR);
    expect(Math.abs(freq - 880) / 880).toBeLessThan(0.02);
  });

  it("未登録サンプル ID でもクラッシュせずフォールバックする", () => {
    const v = createVoice();
    triggerVoice(v, {
      startSec: 0,
      endSec: 0.5,
      pitch: 60,
      velocity: 100,
      waveform: "sine",
      adsr: { attack: 0.01, decay: 0.05, sustain: 0.8, release: 0.1 },
      pan: 0,
      volume: 1,
      sampleId: "missing",
    });
    processVoiceEnv(v, 1 / SR, 0.1);
    const s = voiceSample(v, SR, 0.1);
    expect(Number.isFinite(s.l)).toBe(true);
  });
});
