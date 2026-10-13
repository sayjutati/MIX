import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Instrument, Project, Track } from "../../types/project";
import { isAudioTrack, secToBeat } from "../../types/project";
import { audioTracks, LANE_ROLES, tracksInRole } from "../../utils/laneRole";

type Props = {
  project: Project;
  instruments: Instrument[];
  selectedTrackId: string | null;
  playheadBeat: number;
  playing: boolean;
  beatsVisible: number;
  beatWidth: number;
  onSelectTrack: (id: string) => void;
  onSeekBeat: (beat: number) => void;
};

const LANE_H = 36;
const LABEL_W = 88;

type Lane = { id: string; label: string; color: string; tracks: Track[]; pickId: string };

export function ArrangementView({
  project,
  instruments,
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

  const lanes = useMemo<Lane[]>(() => {
    const roleLanes = LANE_ROLES.map((r) => {
      const members = tracksInRole(project.tracks, instruments, r.id);
      const pick =
        members.find((t) => t.id === selectedTrackId)?.id ?? members[0]?.id ?? "";
      return {
        id: r.id,
        label: r.label,
        color: r.accent,
        tracks: members,
        pickId: pick,
      };
    });
    const extras = audioTracks(project.tracks).map((t) => ({
      id: t.id,
      label: t.name,
      color: t.color,
      tracks: [t],
      pickId: t.id,
    }));
    return [...roleLanes, ...extras];
  }, [project.tracks, instruments, selectedTrackId]);

  useEffect(() => {
    if (!playing || !scrollRef.current) return;
    const phx = playheadBeat * beatWidth;
    const el = scrollRef.current;
    const target = Math.max(0, phx - el.clientWidth * 0.35);
    if (Math.abs(el.scrollLeft - target) > 4) el.scrollLeft = target;
  }, [playing, playheadBeat, beatWidth]);

  const drawLane = useCallback(
    (ctx: CanvasRenderingContext2D, lane: Lane, y: number, w: number) => {
      ctx.fillStyle = "#14141c";
      ctx.fillRect(0, y, w, LANE_H - 1);
      for (const track of lane.tracks) {
        if (isAudioTrack(track)) {
          for (const clip of track.clips ?? []) {
            const x = clip.startBeat * beatWidth;
            const cw = Math.max(4, secToBeat(clip.durationSec, project.tempo) * beatWidth);
            ctx.fillStyle = hexAlpha(track.color, 0.55);
            ctx.fillRect(x + 1, y + 5, cw - 2, LANE_H - 11);
          }
        } else {
          for (const note of track.notes) {
            const x = note.start * beatWidth;
            const cw = Math.max(3, note.duration * beatWidth - 1);
            const vel = note.velocity / 127;
            ctx.fillStyle = hexAlpha(track.color, 0.4 + vel * 0.45);
            ctx.fillRect(x + 0.5, y + 6, cw, LANE_H - 13);
          }
        }
      }
    },
    [beatWidth, project.tempo]
  );

  useEffect(() => {
    const canvas = document.getElementById("arrangement-canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const h = Math.max(LANE_H, lanes.length * LANE_H);
    canvas.width = width * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    lanes.forEach((lane, i) => drawLane(ctx, lane, i * LANE_H, width));

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
  }, [lanes, width, beatsVisible, beatWidth, drawLane, project.loopStart, project.loopEnd]);

  const onTimelinePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const timeline = e.currentTarget;
    const seekAt = (clientX: number) => {
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
        {lanes.map((lane) => {
          const selected = lane.tracks.some((t) => t.id === selectedTrackId);
          return (
            <button
              key={lane.id}
              type="button"
              className={`arrangement__label${selected ? " is-selected" : ""}`}
              style={{ height: LANE_H, borderLeftColor: lane.color }}
              onClick={() => lane.pickId && onSelectTrack(lane.pickId)}
            >
              <span className="arrangement__label-name">{lane.label}</span>
            </button>
          );
        })}
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
