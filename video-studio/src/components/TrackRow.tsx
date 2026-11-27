import { useRef, useState } from "react";
import type { EditorApi } from "../hooks/useEditor";
import type { EditorState, TextClip, TimelineClip, Track } from "../types";
import { TRACK_HEADER_WIDTH, clipTimelineEnd } from "../types";
import { clipsOnTrack } from "../utils/timeline";
import { ClipBlock } from "./ClipBlock";
import { TrackHeader } from "./TrackHeader";

interface Props {
  track: Track;
  state: EditorState;
  timelineDuration: number;
  editor: EditorApi;
  anySolo: boolean;
  onSeekTime: (time: number) => void;
  onDropExternalFiles?: (files: FileList, trackId: string, startSec: number) => void;
  onClipContextMenu: (clipId: string, clientX: number, clientY: number) => void;
}

const findHoveredTrackId = (clientX: number, clientY: number): string | undefined => {
  const el = document.elementFromPoint(clientX, clientY);
  return el?.closest<HTMLElement>("[data-track-id]")?.dataset.trackId;
};

export const TrackRow = ({
  track,
  state,
  timelineDuration,
  editor,
  anySolo,
  onSeekTime,
  onDropExternalFiles,
  onClipContextMenu,
}: Props) => {
  const laneRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const laneClips: TimelineClip[] =
    track.kind === "text" ? [] : clipsOnTrack(state.clips, track.id);
  const textLane: TextClip[] =
    track.kind === "text" ? clipsOnTrack(state.textClips, track.id) : [];

  const canRemove =
    state.tracks.filter((t) => t.kind === track.kind).length > 1 &&
    laneClips.length === 0 &&
    textLane.length === 0;

  const selectedMedia = state.clips.find((x) => x.id === state.selectedClipId);

  const startClipMove = (clipId: string, initialStart: number, e: React.PointerEvent) => {
    if (track.locked) return;
    e.preventDefault();
    const startX = e.clientX;
    const px = state.pxPerSec;
    editor.beginGesture();

    const onMove = (ev: PointerEvent) => {
      const dt = (ev.clientX - startX) / px;
      const hoveredTrack = findHoveredTrackId(ev.clientX, ev.clientY);
      editor.moveClip(clipId, initialStart + dt, hoveredTrack, ev.altKey);
    };
    const onUp = () => {
      editor.endGesture();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const startClipTrim = (
    clipId: string,
    edge: "start" | "end",
    initialEdgeTime: number,
    e: React.PointerEvent
  ) => {
    if (track.locked) return;
    e.preventDefault();
    const startX = e.clientX;
    const px = state.pxPerSec;
    editor.beginGesture();

    const onMove = (ev: PointerEvent) => {
      const dt = (ev.clientX - startX) / px;
      editor.trimClipTo(clipId, edge, initialEdgeTime + dt, ev.altKey);
    };
    const onUp = () => {
      editor.endGesture();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const laneWidth = timelineDuration * state.pxPerSec;

  return (
    <div
      className={`track-row track-row--${track.kind} ${dragOver ? "track-row--drop-target" : ""} ${track.hidden || track.muted ? "track-row--dim" : ""}`}
      data-track-id={track.id}
      style={{ width: TRACK_HEADER_WIDTH + laneWidth }}
    >
      <TrackHeader
        track={track}
        selected={state.selectedTrackId === track.id}
        canRemove={canRemove}
        editor={editor}
        anySolo={anySolo}
      />

      <div
        ref={laneRef}
        className="track-row__lane"
        style={{ width: laneWidth }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if (e.target !== e.currentTarget) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const sec = Math.max(0, (e.clientX - rect.left) / state.pxPerSec);
          editor.patch({ selectedTrackId: track.id, selectedClipId: null });
          onSeekTime(sec);
        }}
        onDragOver={(e) => {
          const hasAsset = e.dataTransfer.types.includes("application/x-mix-asset");
          const hasFiles = e.dataTransfer.types.includes("Files");
          if (hasAsset || hasFiles) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            if (!dragOver) setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          setDragOver(false);
          const rect = laneRef.current?.getBoundingClientRect();
          const start = rect ? Math.max(0, (e.clientX - rect.left) / state.pxPerSec) : state.playhead;

          const assetId = e.dataTransfer.getData("application/x-mix-asset");
          if (assetId) {
            e.preventDefault();
            if (track.locked) return;
            editor.addClipFromAsset(assetId, track.id, start);
            return;
          }

          if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onDropExternalFiles) {
            e.preventDefault();
            onDropExternalFiles(e.dataTransfer.files, track.id, start);
          }
        }}
      >
        {laneClips.map((clip) => {
          const asset = state.assets.find((a) => a.id === clip.assetId);
          const linkedPeer = Boolean(
            selectedMedia &&
              (selectedMedia.linkedClipId === clip.id || clip.linkedClipId === selectedMedia.id) &&
              state.selectedClipId !== clip.id
          );
          return (
            <ClipBlock
              key={clip.id}
              clip={clip}
              trackKind={track.kind}
              label={asset?.name ?? "クリップ"}
              state={state}
              selected={state.selectedClipId === clip.id}
              linkedSelected={linkedPeer}
              assetUrl={asset?.url}
              onSelect={() => editor.patch({ selectedClipId: clip.id, selectedTrackId: track.id })}
              onToggleAudio={() => editor.toggleClipAudio(clip.id)}
              onDragStart={(e) => startClipMove(clip.id, clip.start, e)}
              onTrimStart={(e) => startClipTrim(clip.id, "start", clip.start, e)}
              onTrimEnd={(e) => startClipTrim(clip.id, "end", clipTimelineEnd(clip), e)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.patch({ selectedClipId: clip.id, selectedTrackId: track.id });
                onClipContextMenu(clip.id, e.clientX, e.clientY);
              }}
            />
          );
        })}

        {textLane.map((tc) => {
          const left = tc.start * state.pxPerSec;
          const width = Math.max(tc.duration * state.pxPerSec, 14);
          const selected = state.selectedClipId === tc.id;
          return (
            <div
              key={tc.id}
              className={`clip-block clip-block--text ${selected ? "clip-block--selected" : ""}`}
              style={{ left, width }}
              onClick={(e) => {
                e.stopPropagation();
                editor.patch({ selectedClipId: tc.id, selectedTrackId: track.id });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.patch({ selectedClipId: tc.id, selectedTrackId: track.id });
                onClipContextMenu(tc.id, e.clientX, e.clientY);
              }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                if ((e.target as HTMLElement).closest(".clip-block__handle")) return;
                e.stopPropagation();
                editor.patch({ selectedClipId: tc.id, selectedTrackId: track.id });
                startClipMove(tc.id, tc.start, e);
              }}
            >
              <div
                className="clip-block__handle clip-block__handle--left"
                title="テロップ開始位置をトリム"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  editor.patch({ selectedClipId: tc.id, selectedTrackId: track.id });
                  startClipTrim(tc.id, "start", tc.start, e);
                }}
              />
              <div className="clip-block__body">
                <div className="clip-block__header">
                  <span className="clip-block__tag clip-block__tag--text">T</span>
                  <span className="clip-block__title" title={tc.text}>
                    {tc.text.replace(/\s+/g, " ") || "（空のテロップ）"}
                  </span>
                </div>
              </div>
              <div
                className="clip-block__handle clip-block__handle--right"
                title="テロップ終了位置をトリム"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  editor.patch({ selectedClipId: tc.id, selectedTrackId: track.id });
                  startClipTrim(tc.id, "end", clipTimelineEnd(tc), e);
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
