import { getClipOrigin, originLabel } from "../audio/clipAudio";
import type { EditorState, TimelineClip } from "../types";
import { timelineX } from "../types";
import { WaveformStrip } from "./WaveformStrip";

interface Props {
  clip: TimelineClip;
  label: string;
  state: EditorState;
  selected: boolean;
  isAudioTrack: boolean;
  assetUrl?: string;
  onSelect: () => void;
  onTrimStart: (e: React.MouseEvent) => void;
  onTrimEnd: (e: React.MouseEvent) => void;
  onDragStart: (e: React.MouseEvent) => void;
  onToggleAudio?: () => void;
}

const originClass: Record<string, string> = {
  daw: "clip-block--daw",
  "video-linked": "clip-block--linked",
  media: "clip-block--media",
};

export const ClipBlock = ({
  clip,
  label,
  state,
  selected,
  isAudioTrack,
  assetUrl,
  onSelect,
  onTrimStart,
  onTrimEnd,
  onDragStart,
  onToggleAudio,
}: Props) => {
  const left = timelineX(clip.start, state.pxPerSec) - timelineX(0, state.pxPerSec);
  const width = clip.duration * state.pxPerSec;
  const origin = getClipOrigin(clip);
  const hasCrossfade = clip.transitionOut?.kind === "crossfade";

  return (
    <div
      className={`clip-block ${originClass[origin] ?? ""} ${selected ? "clip-block--selected" : ""} ${clip.audioMuted ? "clip-block--audio-off" : ""} ${hasCrossfade ? "clip-block--xfade" : ""}`}
      style={{ left, width: Math.max(width, 8) }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest(".clip-block__handle, .clip-block__audio-btn")) return;
        onDragStart(e);
      }}
    >
      <div
        className="clip-block__handle clip-block__handle--left"
        onMouseDown={(e) => {
          e.stopPropagation();
          onTrimStart(e);
        }}
      />
      <div className="clip-block__body">
        {isAudioTrack && assetUrl && (
          <WaveformStrip clip={clip} assetUrl={assetUrl} pxPerSec={state.pxPerSec} />
        )}
        <span className="clip-block__label" title={`${label} — ${originLabel[origin]}`}>
          {isAudioTrack && (
            <button
              type="button"
              className="clip-block__audio-btn"
              onClick={(e) => {
                e.stopPropagation();
                onToggleAudio?.();
              }}
              title={clip.audioMuted ? "音声オン" : "音声オフ"}
            >
              {clip.audioMuted ? "🔇" : "🔊"}
            </button>
          )}
          {origin === "daw" && <span className="clip-block__tag">DAW</span>}
          {origin === "video-linked" && <span className="clip-block__tag">動画音</span>}
          {hasCrossfade && <span className="clip-block__tag clip-block__tag--xfade">XF</span>}
          {label}
        </span>
      </div>
      <div
        className="clip-block__handle clip-block__handle--right"
        onMouseDown={(e) => {
          e.stopPropagation();
          onTrimEnd(e);
        }}
      />
    </div>
  );
};
