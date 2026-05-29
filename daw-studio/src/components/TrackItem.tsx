import { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import { Copy, Trash2, Volume2, X } from "lucide-react";
import { decodeAudioUrl } from "../audio/decode";
import { audioEngine } from "../audio/engine";
import {
  PIXELS_PER_SECOND,
  clipEffectiveOffset,
  type Clip,
  type Track,
} from "../types";

type ClipViewProps = {
  track: Track;
  clip: Clip;
  isSelected: boolean;
  effectiveMute: boolean;
  globalTime: number;
  canDelete: boolean;
  onSelect: () => void;
  onUpdateClip: (clipId: number, field: keyof Clip, value: number) => void;
  onDeleteClip: (clipId: number) => void;
  onContextMenu: (e: React.MouseEvent) => void;
};

function ClipView({
  track,
  clip,
  isSelected,
  effectiveMute,
  globalTime,
  canDelete,
  onSelect,
  onUpdateClip,
  onDeleteClip,
  onContextMenu,
}: ClipViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const trackRef = useRef(track);
  const clipRef = useRef(clip);
  trackRef.current = track;
  clipRef.current = clip;

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    const trackId = trackRef.current.id;
    const clipId = clip.id;

    wavesurferRef.current?.destroy();
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "rgba(255, 255, 255, 0.4)",
      progressColor: "rgba(255, 255, 255, 0.9)",
      height: 80,
      url: clip.url,
      interact: false,
      minPxPerSec: PIXELS_PER_SECOND,
      fillParent: false,
      hideScrollbar: true,
    });
    wavesurferRef.current = ws;
    ws.setVolume(0);

    ws.on("ready", () => {
      const dur = ws.getDuration() || 0;
      if (dur && dur !== clipRef.current.duration) {
        onUpdateClip(clipId, "duration", dur);
      }
      const media = ws.getMediaElement();
      if (media) {
        media.muted = true;
        media.volume = 0;
      }
    });

    const { ctx } = audioEngine.getContext();
    void decodeAudioUrl(clip.url, ctx)
      .then((buffer) => {
        if (cancelled) return;
        audioEngine.setClipBuffer(trackId, clipId, buffer);
      })
      .catch((err) => console.error("Failed to decode clip audio:", err));

    return () => {
      cancelled = true;
      audioEngine.removeClip(trackId, clipId);
      ws.destroy();
      wavesurferRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.url, clip.id]);

  // クリップ内の白線（再生位置）
  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    const dur = clip.duration || ws.getDuration() || 0;
    const local = globalTime - clipEffectiveOffset(track, clip);
    const waveTime = Math.max(0, local * track.speed);
    if (dur > 0 && local >= 0 && local <= dur / track.speed) {
      ws.setTime(Math.min(waveTime, dur));
    }
  }, [globalTime, clip, track]);

  // offset 変更時、再生中なら同期し直す
  useEffect(() => {
    audioEngine.restartIfPlaying(track.id);
  }, [clip.offset, track.id]);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    const startX = e.clientX;
    const startOffset = clip.offset;

    const move = (ev: MouseEvent) => {
      const diffX = ev.clientX - startX;
      onUpdateClip(clip.id, "offset", Math.max(0, startOffset + diffX / PIXELS_PER_SECOND));
    };
    const end = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
  };

  const clipWidth = Math.max((clip.duration || 0) * PIXELS_PER_SECOND, 40);

  return (
    <div
      className={`track-clip ${isSelected ? "track-clip--selected" : ""}`}
      style={{
        left: `${clip.offset * PIXELS_PER_SECOND}px`,
        width: `${clipWidth}px`,
        background: track.color,
        opacity: effectiveMute ? 0.35 : 1,
      }}
      onMouseDown={handleDragStart}
      onContextMenu={onContextMenu}
    >
      <div ref={containerRef} className="track-clip__wave" />
      {canDelete && (
        <button
          type="button"
          className="track-clip__del tooltip"
          data-tooltip="このテイクを削除"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteClip(clip.id);
          }}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

type Props = {
  track: Track;
  isSelected: boolean;
  hasSolo: boolean;
  globalTime: number;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  onDuplicate: (track: Track) => void;
  onUpdate: (id: number, field: keyof Track, value: Track[keyof Track]) => void;
  onUpdateClip: (trackId: number, clipId: number, field: keyof Clip, value: number) => void;
  onDeleteClip: (trackId: number, clipId: number) => void;
  onContextMenu: (e: React.MouseEvent, trackId: number) => void;
};

export function TrackItem({
  track,
  isSelected,
  hasSolo,
  globalTime,
  onSelect,
  onDelete,
  onDuplicate,
  onUpdate,
  onUpdateClip,
  onDeleteClip,
  onContextMenu,
}: Props) {
  const trackRef = useRef(track);
  const hasSoloRef = useRef(hasSolo);
  trackRef.current = track;
  hasSoloRef.current = hasSolo;

  const effectiveMute = track.isMuted || (hasSolo && !track.isSolo);

  // ランタイム登録（FX チェーン保持）。子クリップの setClipBuffer より前に存在させる
  const stateRef = useRef({
    getTrack: () => trackRef.current,
    isAudible: () => {
      const t = trackRef.current;
      return !t.isMuted && !(hasSoloRef.current && !t.isSolo);
    },
  });
  audioEngine.register(track.id, stateRef.current);

  useEffect(() => {
    const id = track.id;
    return () => audioEngine.unregister(id);
  }, [track.id]);

  useEffect(() => {
    audioEngine.updateTrackEffects(track.id);
  }, [
    track.id,
    track.pan,
    track.bass,
    track.treble,
    track.compressor,
    track.noiseReduce,
    track.chorus,
    track.delay,
    track.reverb,
    track.tremolo,
    track.volume,
  ]);

  useEffect(() => {
    audioEngine.restartIfPlaying(track.id);
  }, [track.id, track.speed, track.pitch, track.nudgeMs, track.isMuted, track.isSolo, hasSolo]);

  useEffect(() => {
    audioEngine.setTrackVolume(track.id, effectiveMute ? 0 : track.volume);
  }, [track.id, track.volume, effectiveMute]);

  const canDeleteClip = track.clips.length > 1;

  return (
    <div
      className={`track-row ${isSelected ? "track-row--selected" : ""}`}
      style={{ boxShadow: isSelected ? `inset 4px 0 0 ${track.color}` : undefined }}
    >
      <div className="track-row__header" onClick={() => onSelect(track.id)}>
        <div className="track-row__title-row">
          <div className="track-row__title">
            <input
              type="color"
              value={track.color}
              onChange={(e) => onUpdate(track.id, "color", e.target.value)}
              className="tooltip track-row__color"
              data-tooltip="色を変更"
              onClick={(e) => e.stopPropagation()}
            />
            <input
              type="text"
              value={track.name}
              onChange={(e) => onUpdate(track.id, "name", e.target.value)}
              className="track-row__name-input"
              onClick={(e) => e.stopPropagation()}
            />
            <span className={`track-row__badge ${track.kind === "bgm" ? "track-row__badge--bgm" : ""}`}>
              {track.kind === "bgm" ? "BGM" : "REC"}
            </span>
            {track.clips.length > 1 && (
              <span className="track-row__take-count tooltip" data-tooltip="このレーンのテイク数">
                {track.clips.length}
              </span>
            )}
          </div>
          <div className="track-row__actions">
            <button
              type="button"
              className="tooltip"
              data-tooltip="複製"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(track);
              }}
            >
              <Copy size={14} />
            </button>
            <button
              type="button"
              className="tooltip track-row__delete"
              data-tooltip="削除"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(track.id);
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <div className="track-row__controls" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`track-btn ${track.isSolo ? "track-btn--solo" : ""}`}
            onClick={() => onUpdate(track.id, "isSolo", !track.isSolo)}
          >
            S
          </button>
          <button
            type="button"
            className={`track-btn ${track.isMuted ? "track-btn--mute" : ""}`}
            onClick={() => onUpdate(track.id, "isMuted", !track.isMuted)}
          >
            M
          </button>
          <Volume2 size={16} color="#888" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={track.volume}
            onChange={(e) => onUpdate(track.id, "volume", parseFloat(e.target.value))}
            className="track-row__volume"
          />
        </div>
      </div>

      <div
        className="track-row__timeline"
        onContextMenu={(e) => onContextMenu(e, track.id)}
        onClick={() => onSelect(track.id)}
      >
        {track.clips.map((clip) => (
          <ClipView
            key={clip.id}
            track={track}
            clip={clip}
            isSelected={isSelected}
            effectiveMute={effectiveMute}
            globalTime={globalTime}
            canDelete={canDeleteClip}
            onSelect={() => onSelect(track.id)}
            onUpdateClip={(clipId, field, value) => onUpdateClip(track.id, clipId, field, value)}
            onDeleteClip={(clipId) => onDeleteClip(track.id, clipId)}
            onContextMenu={(e) => onContextMenu(e, track.id)}
          />
        ))}
      </div>
    </div>
  );
}
