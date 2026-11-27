import { useEffect, useMemo, useState } from "react";
import { getWaveformData, slicePeaksForClip, type WaveformData } from "../audio/waveform";
import type { TimelineClip } from "../types";
import { originLabel, getClipOrigin } from "../audio/clipAudio";

interface Props {
  clip: TimelineClip;
  assetUrl: string;
  pxPerSec: number;
}

export const WaveformStrip = ({ clip, assetUrl, pxPerSec }: Props) => {
  const [data, setData] = useState<WaveformData | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getWaveformData(assetUrl).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [assetUrl]);

  const width = Math.max(8, clip.duration * pxPerSec);
  const bars = useMemo(() => {
    if (!data) return [];
    const target = Math.max(12, Math.min(300, Math.floor(width / 3)));
    return slicePeaksForClip(data, clip.inPoint, clip.duration, clip.speed || 1, target);
  }, [data, clip.inPoint, clip.duration, clip.speed, width]);

  const volScale = Math.min(1.35, Math.max(0.05, clip.volume));

  return (
    <div
      className={`waveform-strip ${clip.audioMuted ? "waveform-strip--muted" : ""}`}
      title={originLabel[getClipOrigin(clip)]}
    >
      <svg
        className="waveform-strip__svg"
        viewBox={`0 0 ${bars.length || 1} 2`}
        preserveAspectRatio="none"
      >
        {bars.map((p, i) => {
          const h = Math.min(1.92, Math.max(0.08, p * volScale * 1.75));
          return (
            <rect
              key={i}
              x={i + 0.12}
              y={1 - h / 2}
              width={0.76}
              height={h}
              rx={0.15}
              fill="currentColor"
            />
          );
        })}
      </svg>
    </div>
  );
};
