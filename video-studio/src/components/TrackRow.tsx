import type { EditorApi } from "../hooks/useEditor";
import type { EditorState, TextClip, TimelineClip, Track } from "../types";
import { clipsOnTrack } from "../utils/timeline";
import { ClipBlock } from "./ClipBlock";
import { TrackHeader } from "./TrackHeader";

interface Props {
  track: Track;
  state: EditorState;
  editor: EditorApi;
}

export const TrackRow = ({ track, state, editor }: Props) => {
  const videoClips = clipsOnTrack(state.clips, track.id);
  const textClips = state.textClips.filter((c) => c.trackId === track.id);
  const all: TimelineClip[] = [...videoClips, ...textClips];
  const anySolo = state.tracks.some((t) => t.solo);
  const isAudio = track.kind === "audio";

  const labelFor = (clip: TimelineClip) => {
    if (state.textClips.some((t) => t.id === clip.id)) {
      return (clip as TextClip).text || "テキスト";
    }
    return state.assets.find((a) => a.id === clip.assetId)?.name ?? "クリップ";
  };

  const dragClip = (clip: TimelineClip, e: React.MouseEvent) => {
    const startX = e.clientX;
    const origStart = clip.start;
    const onMove = (ev: MouseEvent) => {
      editor.moveClip(clip.id, origStart + (ev.clientX - startX) / state.pxPerSec);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className={`track-row track-row--${track.kind}`} style={{ height: track.height }}>
      <div className="track-row__header">
        <TrackHeader track={track} editor={editor} anySolo={anySolo} />
      </div>
      <div
        className="track-row__lane"
        onClick={() => editor.patch({ selectedTrackId: track.id })}
        onDoubleClick={() => {
          if (track.kind === "text") editor.addClipFromAsset("", track.id);
        }}
      >
        {all.map((clip) => {
          const asset = state.assets.find((a) => a.id === clip.assetId);
          return (
            <ClipBlock
              key={clip.id}
              clip={clip}
              label={labelFor(clip)}
              state={state}
              selected={state.selectedClipId === clip.id}
              isAudioTrack={isAudio}
              assetUrl={asset?.url}
              onSelect={() => editor.patch({ selectedClipId: clip.id })}
              onTrimStart={(d) => editor.trimClip(clip.id, "start", d)}
              onTrimEnd={(d) => editor.trimClip(clip.id, "end", d)}
              onDragStart={(e) => !track.locked && dragClip(clip, e)}
              onToggleAudio={
                isAudio ? () => editor.toggleClipAudio(clip.id) : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
};
