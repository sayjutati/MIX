import { getAudioContext } from "./engine";

export async function playMetronomeClick(accent: boolean) {
  const ctx = await getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = accent ? 1200 : 880;
  gain.gain.setValueAtTime(accent ? 0.35 : 0.22, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.05);
}
