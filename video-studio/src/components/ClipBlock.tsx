import { Link2, Volume2, VolumeX } from "lucide-react";
import { getClipOrigin, originLabel } from "../audio/clipAudio";
import type { EditorState, TimelineClip, TrackKind } from "../types";
import { WaveformStrip } from "./WaveformStrip";

interface Props {
  clip: TimelineClip;
  trackKind: TrackKind;
  label: string;
  state: EditorState;
  selected: boolean;
  linkedSelected: boolean;
  assetUrl?: string;
  onSelect: () => void;
  onTrimStart: (e: React.PointerEvent) => void;
  onTrimEnd: (e: React.PointerEvent) => void;
  onDragStart: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggleAudio?: () => void;
}

const originClass: Record<string, string> = {
  daw: "clip-block--daw",
  "video-linked": "clip-block--linked",
  media: "clip-block--media",
};

export const ClipBlock = ({
  clip,
  trackKind,
  label,
  state,
  selected,
  linkedSelected,
  assetUrl,
  onSelect,
  onTrimStart,
  onTrimEnd,
  onDragStart,
  onContextMenu,
  onToggleAudio,
}: Props) => {
  const left = clip.start * state.pxPerSec;
  const width = Math.max(clip.duration * state.pxPerSec, 10);
  const origin = getClipOrigin(clip);
  const isAudioTrack = trackKind === "audio";
  const hasCrossfade = clip.transitionOut?.kind === "crossfade";
  const fadeInPx = Math.min(width / 2, (clip.fadeIn ?? 0) * state.pxPerSec);
  const fadeOutPx = Math.min(width / 2, (clip.fadeOut ?? 0) * state.pxPerSec);

  return (
    <div
      className={[
        "clip-block",
        `clip-block--kind-${trackKind}`,
        isAudioTrack ? originClass[origin] ?? "" : "",
        selected ? "clip-block--selected" : "",
        linkedSelected ? "clip-block--linked-peer" : "",
        clip.audioMuted && isAudioTrack ? "clip-block--audio-off" : "",
        hasCrossfade ? "clip-block--xfade" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ left, width }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onContextMenu={onContextMenu}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest(".clip-block__handle, .clip-block__audio-btn")) return;
        e.stopPropagation();
        onSelect();
        onDragStart(e);
      }}
    >
      <div
        className="clip-block__handle clip-block__handle--left"
        title="左端をドラッグして開始位置をトリム"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          onSelect();
          onTrimStart(e);
        }}
      />

      <div className="clip-block__body">
        {/* フェードイン・フェードアウトの視覚スロープ */}
        {(fadeInPx > 2 || fadeOutPx > 2) && (
          <svg className="clip-block__fade-svg" preserveAspectRatio="none" viewBox={`0 0 ${width} 40`}>
            {fadeInPx > 2 && (
              <polygon points={`0,0 ${fadeInPx},0 0,40`} fill="rgba(0,0,0,0.38)" />
            )}
            {fadeOutPx > 2 && (
              <polygon
                points={`${width - fadeOutPx},0 ${width},0 ${width},40`}
                fill="rgba(0,0,0,0.38)"
              />
            )}
          </svg>
        )}

        <div className="clip-block__header">
          {isAudioTrack && (
            <button
              type="button"
              className="clip-block__audio-btn"
              onClick={(e) => {
                e.stopPropagation();
                onToggleAudio?.();
              }}
              title={clip.audioMuted ? "クリックで音声オン" : "クリックで音声オフ"}
            >
              {clip.audioMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
            </button>
          )}
          {clip.linkedClipId && (
            <span className="clip-block__link-icon" title="映像と音声がリンク同期中">
              <Link2 size={11} />
            </span>
          )}
          {isAudioTrack && origin === "daw" && <span className="clip-block__tag">DAW</span>}
          {isAudioTrack && origin === "video-linked" && <span className="clip-block__tag">動画音</span>}
          {clip.speed !== 1 && <span className="clip-block__tag">{clip.speed}×</span>}
          {hasCrossfade && <span className="clip-block__tag clip-block__tag--xfade">XF</span>}
          <span
            className="clip-block__title"
            title={`${label}${isAudioTrack ? ` — ${originLabel[origin]}` : ""}`}
          >
            {label}
          </span>
        </div>

        {isAudioTrack && assetUrl && (
          <WaveformStrip clip={clip} assetUrl={assetUrl} pxPerSec={state.pxPerSec} />
        )}

        {trackKind === "video" && assetUrl && width >= 44 && (
          <div className="clip-block__filmstrip" aria-hidden>
            <video src={`${assetUrl}#t=${Math.max(0, clip.inPoint).toFixed(2)}`} muted preload="metadata" />
          </div>
        )}

        {trackKind === "overlay" && assetUrl && width >= 36 && (
          <div className="clip-block__filmstrip" aria-hidden>
            <img src={assetUrl} alt="" />
          </div>
        )}
      </div>

      <div
        className="clip-block__handle clip-block__handle--right"
        title="右端をドラッグして終了位置をトリム"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          onSelect();
          onTrimEnd(e);
        }}
      />
    </div>
  );
};
