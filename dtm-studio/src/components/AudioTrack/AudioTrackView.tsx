import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioClip, Track } from "../../types/project";
import { secToBeat } from "../../types/project";
import { decodeAudioUrl } from "../../audio/decode";
import { getAudioContext } from "../../audio/engine";
import { peaksFromBuffer } from "../../audio/peaks";
import { getAudioAssetUrl } from "../../storage/audioAssetStorage";

type Props = {
  track: Track;
  tempo: number;
  playheadBeat: number;
  playing: boolean;
  beatsVisible: number;
  beatWidth: number;
  loopStart: number;
  loopEnd: number;
  loopEnabled: boolean;
  onSeekBeat: (beat: number) => void;
  onLoopChange: (start: number, end: number) => void;
  onUpdateClip: (clipId: string, patch: Partial<AudioClip>) => void;
  onRemoveClip: (clipId: string) => void;
  onEditStart?: () => void;
};

type ClipVisual = {
  clip: AudioClip;
  peaks: number[];
};

export function AudioTrackView({
  track,
  tempo,
  playheadBeat,
  playing,
  beatsVisible,
  beatWidth,
  loopStart: _loopStart,
  loopEnd: _loopEnd,
  loopEnabled: _loopEnabled,
  onSeekBeat,
  onLoopChange: _onLoopChange,
  onUpdateClip,
  onRemoveClip,
  onEditStart,
}: Props) {
  const [visuals, setVisuals] = useState<ClipVisual[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ clipId: string; startX: number; startBeat: number } | null>(null);
  const width = beatsVisible * beatWidth;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: ClipVisual[] = [];
      for (const clip of track.clips ?? []) {
        const url = await getAudioAssetUrl(clip.assetId);
        if (!url) continue;
        try {
          const ctx = await getAudioContext();
          const buf = await decodeAudioUrl(url, ctx);
          if (!cancelled) next.push({ clip, peaks: peaksFromBuffer(buf, 128) });
        } catch {
          /* skip */
        }
      }
      if (!cancelled) setVisuals(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [track.clips]);

  useEffect(() => {
    if (!playing || !scrollRef.current) return;
    const x = playheadBeat * beatWidth;
    const el = scrollRef.current;
    const viewW = el.clientWidth;
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + viewW - 40) {
      el.scrollLeft = Math.max(0, x - viewW * 0.3);
    }
  }, [playing, playheadBeat, beatWidth]);

  const onClipPointerDown = useCallback(
    (e: React.PointerEvent, clip: AudioClip) => {
      e.stopPropagation();
      onEditStart?.();
      dragRef.current = { clipId: clip.id, startX: e.clientX, startBeat: clip.startBeat };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [onEditStart]
  );

  const onClipPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (e.clientX - d.startX) / beatWidth;
      onUpdateClip(d.clipId, { startBeat: Math.max(0, d.startBeat + dx) });
    },
    [beatWidth, onUpdateClip]
  );

  const onClipPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div className="audio-track-view">
      <div className="audio-track-view__scroll" ref={scrollRef}>
        <div className="audio-track-view__inner" style={{ width }}>
          <div
            className="audio-track-view__ruler"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
              onSeekBeat(Math.max(0, x / beatWidth));
            }}
          >
            {Array.from({ length: Math.ceil(beatsVisible / 4) + 1 }, (_, i) => (
              <span key={i} className="audio-track-view__tick" style={{ left: i * 4 * beatWidth }}>
                {i + 1}小節
              </span>
            ))}
          </div>
          <div className="audio-track-view__lane">
            {visuals.map(({ clip, peaks }) => {
              const w = secToBeat(clip.durationSec, tempo) * beatWidth;
              return (
                <div
                  key={clip.id}
                  className="audio-clip tooltip"
                  data-tooltip={`${clip.name} — ドラッグで移動 / 右クリックで削除`}
                  style={{ left: clip.startBeat * beatWidth, width: Math.max(w, 24) }}
                  onPointerDown={(e) => onClipPointerDown(e, clip)}
                  onPointerMove={onClipPointerMove}
                  onPointerUp={onClipPointerUp}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onRemoveClip(clip.id);
                  }}
                >
                  <canvas
                    className="audio-clip__wave"
                    ref={(el) => {
                      if (!el) return;
                      const h = el.clientHeight || 64;
                      el.width = Math.max(1, Math.floor(el.clientWidth));
                      el.height = h;
                      const ctx = el.getContext("2d");
                      if (!ctx) return;
                      ctx.clearRect(0, 0, el.width, h);
                      ctx.fillStyle = "rgba(108, 140, 255, 0.85)";
                      const mid = h / 2;
                      peaks.forEach((p, i) => {
                        const x = (i / peaks.length) * el.width;
                        const bar = p * mid * 0.9;
                        ctx.fillRect(x, mid - bar, Math.max(1, el.width / peaks.length), bar * 2);
                      });
                    }}
                  />
                  <span className="audio-clip__label">{clip.name}</span>
                  <span className="audio-clip__dur">{clip.durationSec.toFixed(1)}s</span>
                </div>
              );
            })}
            {(track.clips ?? []).length === 0 && (
              <p className="audio-track-view__empty">
                音声ファイルをドロップするか、下のパネルから取り込み・録音してください
              </p>
            )}
          </div>
          <div
            className="audio-track-view__playhead"
            style={{ left: playheadBeat * beatWidth }}
          />
        </div>
      </div>
    </div>
  );
}
