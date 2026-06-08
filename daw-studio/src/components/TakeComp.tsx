import { Play, Check, Eye, EyeOff } from "lucide-react";
import type { Clip, Track } from "../types";
import { formatTime } from "../utils/time";

type Props = {
  track: Track;
  onSelectTake: (clipId: number) => void;
  onAuditionTake: (clipId: number) => void;
  onToggleTakeMuted: (clipId: number) => void;
};

export function TakeComp({
  track,
  onSelectTake,
  onAuditionTake,
  onToggleTakeMuted,
}: Props) {
  if (track.clips.length <= 1) return null;

  return (
    <div className="take-comp">
      <div className="take-comp__title">
        テイク比較 — 重なった区間は1本採用。別の位置なら複数同時OK
      </div>
      <ul className="take-comp__list">
        {track.clips.map((clip, i) => (
          <TakeRow
            key={clip.id}
            index={i + 1}
            clip={clip}
            active={!clip.muted}
            onSelect={() => onSelectTake(clip.id)}
            onAudition={() => onAuditionTake(clip.id)}
            onToggleMuted={() => onToggleTakeMuted(clip.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function TakeRow({
  index,
  clip,
  active,
  onSelect,
  onAudition,
  onToggleMuted,
}: {
  index: number;
  clip: Clip;
  active: boolean;
  onSelect: () => void;
  onAudition: () => void;
  onToggleMuted: () => void;
}) {
  return (
    <li className={`take-comp__row${active ? " take-comp__row--active" : ""}`}>
      <span className="take-comp__label">
        テイク {index}
        <span className="take-comp__meta">{formatTime(clip.duration)}</span>
        {active && <span className="take-comp__badge">採用</span>}
      </span>
      <div className="take-comp__actions">
        <button
          type="button"
          className="tooltip take-comp__btn"
          data-tooltip="この位置から試聴"
          onClick={onAudition}
        >
          <Play size={14} />
        </button>
        <button
          type="button"
          className={`tooltip take-comp__btn take-comp__btn--pick${active ? " is-on" : ""}`}
          data-tooltip="重なったテイクの中でこの1本を採用"
          onClick={onSelect}
        >
          <Check size={14} />
        </button>
        <button
          type="button"
          className="tooltip take-comp__btn"
          data-tooltip={active ? "ミックスから除外" : "ミックスに含める"}
          onClick={onToggleMuted}
        >
          {active ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
      </div>
    </li>
  );
}
