import { useCallback, useEffect, useRef } from "react";
import type { Project, Track } from "../../types/project";
import { isAudioTrack, secToBeat } from "../../types/project";

type Props = {
  project: Project;
  selectedTrackId: string | null;
  playheadBeat: number;
  playing: boolean;
  beatsVisible: number;
  beatWidth: number;
  onSelectTrack: (id: string) => void;
  onSeekBeat: (beat: number) => void;
};

const LANE_H = 26;
const LABEL_W = 88;

export function ArrangementView({
  project,
  selectedTrackId,
  playheadBeat,
  playing,
  beatsVisible,
  beatWidth,
  onSelectTrack,
  onSeekBeat,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const width = beatsVisible * beatWidth;

  useEffect(() => {
    if (!playing || !scrollRef.current) return;
    const phx = playheadBeat * beatWidth;
    const el = scrollRef.current;
    const target = Math.max(0, phx - el.clientWidth * 0.35);
    if (Math.abs(el.scrollLeft - target) > 4) el.scrollLeft = target;
  }, [playing, playheadBeat, beatWidth]);

  const drawLane = useCallback(
    (ctx: CanvasRenderingContext2D, track: Track, y: number, w: number) => {
      ctx.fillStyle = "#14141c";
      ctx.fillRect(0, y, w, LANE_H - 1);

      if (isAudioTrack(track)) {
        for (const clip of track.clips ?? []) {
          const x = clip.startBeat * beatWidth;
          const cw = Math.max(4, secToBeat(clip.durationSec, project.tempo) * beatWidth);
          ctx.fillStyle = hexAlpha(track.color, 0.55);
          ctx.fillRect(x + 1, y + 4, cw - 2, LANE_H - 9);
        }
      } else {
        for (const note of track.notes) {
          const x = note.start * beatWidth;
          const cw = Math.max(3, note.duration * beatWidth - 1);
          const vel = note.velocity / 127;
          ctx.fillStyle = hexAlpha(track.color, 0.35 + vel * 0.45);
          ctx.fillRect(x + 0.5, y + 6, cw, LANE_H - 12);
        }
      }
    },
    [beatWidth, project.tempo]
  );

  useEffect(() => {
    const canvas = document.getElementById("arrangement-canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const h = project.tracks.length * LANE_H;
    canvas.width = width * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    for (let i = 0; i < project.tracks.length; i++) {
      drawLane(ctx, project.tracks[i]!, i * LANE_H, width);
    }

    const ls = project.loopStart * beatWidth;
    const le = (project.loopEnd - project.loopStart) * beatWidth;
    ctx.fillStyle = "rgba(52, 211, 153, 0.06)";
    ctx.fillRect(ls, 0, le, h);

    for (let b = 0; b <= beatsVisible; b += 4) {
      const x = b * beatWidth;
      ctx.strokeStyle = "#2a2a38";
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
      ctx.stroke();
    }
  }, [project, width, beatsVisible, beatWidth, drawLane]);

  const onTimelinePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const timeline = e.currentTarget;
    const seekAt = (clientX: number) => {
      // 内側要素の rect はスクロールと一緒に動くので scrollLeft を足さない
      const x = clientX - timeline.getBoundingClientRect().left;
      onSeekBeat(Math.max(0, x / beatWidth));
    };
    seekAt(e.clientX);
    const move = (ev: PointerEvent) => seekAt(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="arrangement">
      <div className="arrangement__labels" style={{ width: LABEL_W }}>
        {project.tracks.map((t, i) => (
          <button
            key={t.id}
            type="button"
            className={`arrangement__label${t.id === selectedTrackId ? " is-selected" : ""}`}
            style={{ height: LANE_H, borderLeftColor: t.color }}
            onClick={() => onSelectTrack(t.id)}
          >
            <span className="arrangement__label-num">{i + 1}</span>
            <span className="arrangement__label-name">{t.name}</span>
          </button>
        ))}
      </div>
      <div className="arrangement__scroll" ref={scrollRef}>
        <div
          className="arrangement__timeline"
          style={{ width }}
          onPointerDown={onTimelinePointerDown}
        >
          <canvas id="arrangement-canvas" className="arrangement__canvas" />
          <div
            className={`arrangement__playhead${playing ? " is-playing" : ""}`}
            style={{ left: playheadBeat * beatWidth }}
          />
        </div>
      </div>
    </div>
  );
}

function hexAlpha(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
