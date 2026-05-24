import { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import { Copy, Trash2, Volume2 } from "lucide-react";
import { applyLiveFade } from "../audio/chain";
import { decodeAudioUrl } from "../audio/decode";
import { audioEngine } from "../audio/engine";
import { PIXELS_PER_SECOND, trackEffectiveOffset, type Track } from "../types";

type Props = {
  track: Track;
  isSelected: boolean;
  hasSolo: boolean;
  globalTime: number;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  onDuplicate: (track: Track) => void;
  onUpdate: (id: number, field: keyof Track, value: Track[keyof Track]) => void;
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
  onContextMenu,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const trackRef = useRef(track);
  const hasSoloRef = useRef(hasSolo);
  trackRef.current = track;
  hasSoloRef.current = hasSolo;

  const effectiveMute = track.isMuted || (hasSolo && !track.isSolo);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    const trackId = track.id;

    audioEngine.register(trackId, {
      getTrack: () => trackRef.current,
      isAudible: () => {
        const t = trackRef.current;
        return !t.isMuted && !(hasSoloRef.current && !t.isSolo);
      },
    });

    wavesurferRef.current?.destroy();
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "rgba(255, 255, 255, 0.4)",
      progressColor: "rgba(255, 255, 255, 0.9)",
      height: 80,
      url: track.url,
      interact: false,
      minPxPerSec: PIXELS_PER_SECOND,
      fillParent: false,
      hideScrollbar: true,
    });
    wavesurferRef.current = ws;
    ws.setVolume(0);

    ws.on("ready", () => {
      const dur = ws.getDuration() || 0;
      if (dur !== trackRef.current.duration) {
        onUpdate(trackRef.current.id, "duration", dur);
      }
      const media = ws.getMediaElement();
      if (media) {
        media.muted = true;
        media.volume = 0;
      }
    });

    const { ctx } = audioEngine.getContext();
    void decodeAudioUrl(track.url, ctx)
      .then((buffer) => {
        if (cancelled) return;
        audioEngine.setTrackBuffer(trackId, buffer);
      })
      .catch((err) => console.error("Failed to decode track audio:", err));

    return () => {
      cancelled = true;
      audioEngine.unregister(trackId);
      ws.destroy();
      wavesurferRef.current = null;
    };
  }, [track.url, track.id]);

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
  }, [track.id, track.speed, track.pitch, track.offset, track.nudgeMs, track.isMuted, track.isSolo, hasSolo]);

  useEffect(() => {
    if (effectiveMute) {
      audioEngine.setTrackVolume(track.id, 0);
    } else {
      audioEngine.setTrackVolume(track.id, track.volume);
    }
  }, [track.id, track.volume, effectiveMute]);

  useEffect(() => {
    applyLiveFade(audioEngine.getEffectNodes(track.id)?.fadeGain ?? null, track, globalTime);

    const ws = wavesurferRef.current;
    if (!ws) return;
    const dur = track.duration || ws.getDuration() || 0;
    const local = globalTime - trackEffectiveOffset(track);
    if (dur > 0 && local >= 0 && local <= dur) {
      ws.setTime(local);
    }
  }, [globalTime, track.fadeIn, track.fadeOut, track.offset, track.nudgeMs, track.duration, track.id]);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startOffset = track.offset;

    const handleDragMove = (moveEvent: MouseEvent) => {
      const diffX = moveEvent.clientX - startX;
      onUpdate(track.id, "offset", Math.max(0, startOffset + diffX / PIXELS_PER_SECOND));
    };

    const handleDragEnd = () => {
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("mouseup", handleDragEnd);
    };

    window.addEventListener("mousemove", handleDragMove);
    window.addEventListener("mouseup", handleDragEnd);
  };

  const clipWidth = Math.max((track.duration || 0) * PIXELS_PER_SECOND, 40);

  return (
    <div
      className={`track-row ${isSelected ? "track-row--selected" : ""}`}
      style={{ borderLeftColor: isSelected ? track.color : "transparent" }}
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
        <div
          className={`track-clip ${isSelected ? "track-clip--selected" : ""}`}
          style={{
            left: `${track.offset * PIXELS_PER_SECOND}px`,
            width: `${clipWidth}px`,
            background: track.color,
            opacity: effectiveMute ? 0.35 : 1,
          }}
          onMouseDown={handleDragStart}
        >
          <div ref={containerRef} className="track-clip__wave" />
        </div>
      </div>
    </div>
  );
}
