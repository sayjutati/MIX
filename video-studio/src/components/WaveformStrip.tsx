import { useEffect, useState } from "react";
import { getWaveformPeaks } from "../audio/waveform";
import type { TimelineClip } from "../types";
import { originLabel, getClipOrigin } from "../audio/clipAudio";

interface Props {
  clip: TimelineClip;
  assetUrl: string;
  pxPerSec: number;
}

export const WaveformStrip = ({ clip, assetUrl, pxPerSec }: Props) => {
  const [peaks, setPeaks] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getWaveformPeaks(assetUrl).then((p) => {
      if (!cancelled) setPeaks(p);
    });
    return () => {
      cancelled = true;
    };
  }, [assetUrl]);

  const width = clip.duration * pxPerSec;

  return (
    <div
      className={`waveform-strip ${clip.audioMuted ? "waveform-strip--muted" : ""}`}
      style={{ width: Math.max(width, 8) }}
      title={originLabel[getClipOrigin(clip)]}
    >
      <svg className="waveform-strip__svg" viewBox={`0 0 ${peaks.length || 1} 2`} preserveAspectRatio="none">
        {peaks.map((p, i) => (
          <rect
            key={i}
            x={i}
            y={1 - p}
            width={1}
            height={p}
            fill="currentColor"
          />
        ))}
      </svg>
    </div>
  );
};
