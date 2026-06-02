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
  onTrimStart: (delta: number) => void;
  onTrimEnd: (delta: number) => void;
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

  return (
    <div
      className={`clip-block ${originClass[origin] ?? ""} ${selected ? "clip-block--selected" : ""} ${clip.audioMuted ? "clip-block--audio-off" : ""}`}
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
          const startX = e.clientX;
          const onMove = (ev: MouseEvent) => onTrimStart((ev.clientX - startX) / state.pxPerSec);
          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
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
          {label}
        </span>
      </div>
      <div
        className="clip-block__handle clip-block__handle--right"
        onMouseDown={(e) => {
          e.stopPropagation();
          const startX = e.clientX;
          const onMove = (ev: MouseEvent) => onTrimEnd((ev.clientX - startX) / state.pxPerSec);
          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
      />
    </div>
  );
};
