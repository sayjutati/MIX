/** WaveSurfer 用ピーク（モノラル） */
export const peaksFromBuffer = (
  buffer: AudioBuffer,
  length = 512
): number[] => {
  const ch = buffer.getChannelData(0);
  const ch2 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const step = Math.max(1, Math.floor(ch.length / length));
  const peaks: number[] = [];

  for (let i = 0; i < length; i++) {
    const start = i * step;
    const end = Math.min(start + step, ch.length);
    let max = 0;
    for (let j = start; j < end; j++) {
      const v = ch2 ? (Math.abs(ch[j]) + Math.abs(ch2[j])) * 0.5 : Math.abs(ch[j]);
      if (v > max) max = v;
    }
    peaks.push(max);
  }
  return peaks;
};
