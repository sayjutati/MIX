import { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import { ChevronDown, ChevronUp, Copy, Trash2, Volume2, X } from "lucide-react";
import { decodeAudioUrl } from "../audio/decode";
import { audioEngine } from "../audio/engine";
import { clipEffectiveOffset, type Clip, type Track } from "../types";

type ClipViewProps = {
  track: Track;
  clip: Clip;
  isSelected: boolean;
  effectiveMute: boolean;
  globalTime: number;
  canDelete: boolean;
  pxPerSec: number;
  snapSeconds: number;
  onSelect: () => void;
  onDragStart: () => void;
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
  pxPerSec,
  snapSeconds,
  onSelect,
  onDragStart,
  onUpdateClip,
  onDeleteClip,
  onContextMenu,
}: ClipViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const trackRef = useRef(track);
  const clipRef = useRef(clip);
  const ppsRef = useRef(pxPerSec);
  trackRef.current = track;
  clipRef.current = clip;
  ppsRef.current = pxPerSec;

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
      minPxPerSec: ppsRef.current,
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
      .then(async (buffer) => {
        if (cancelled) return;
        let original: AudioBuffer | null = null;
        if (clip.originalUrl) {
          try {
            original = await decodeAudioUrl(clip.originalUrl, ctx);
          } catch {
            /* noop */
          }
        }
        audioEngine.setClipBuffer(trackId, clipId, buffer, {
          original,
          notes: clip.notes,
        });
      })
      .catch((err) => console.error("Failed to decode clip audio:", err));

    return () => {
      cancelled = true;
      audioEngine.removeClip(trackId, clipId);
      ws.destroy();
      wavesurferRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.url, clip.id, clip.originalUrl]);

  // ピッチノート変更 → Worklet へリアルタイム反映
  useEffect(() => {
    audioEngine.setClipPitch(track.id, clip.id, clip.notes);
  }, [track.id, clip.id, clip.notes]);

  // ズーム変更時に波形を再スケール
  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    try {
      ws.zoom(pxPerSec);
    } catch {
      /* 波形未準備時は無視 */
    }
  }, [pxPerSec]);

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

  const handleDragStart = (e: React.PointerEvent) => {
    if (e.button === 2) return; // 右クリックはメニュー用
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    const startX = e.clientX;
    const startOffset = clip.offset;
    let moved = false;

    const move = (ev: PointerEvent) => {
      const diffX = ev.clientX - startX;
      if (!moved) {
        if (Math.abs(diffX) < 3) return;
        moved = true;
        onDragStart(); // Undo履歴に記録
      }
      let next = Math.max(0, startOffset + diffX / ppsRef.current);
      if (snapSeconds > 0) next = Math.round(next / snapSeconds) * snapSeconds;
      onUpdateClip(clip.id, "offset", next);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  };

  const clipWidth = Math.max((clip.duration || 0) * pxPerSec, 40);

  return (
    <div
      className={`track-clip ${isSelected ? "track-clip--selected" : ""}`}
      style={{
        left: `${clip.offset * pxPerSec}px`,
        width: `${clipWidth}px`,
        background: track.color,
        opacity: effectiveMute || clip.muted ? 0.35 : 1,
        touchAction: "none",
      }}
      onPointerDown={handleDragStart}
      onContextMenu={onContextMenu}
    >
      <div ref={containerRef} className="track-clip__wave" />
      {!clip.muted && track.clips.length > 1 && (
        <span className="track-clip__take-badge">採用</span>
      )}
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
  pxPerSec: number;
  snapSeconds: number;
  index: number;
  total: number;
  onMove: (id: number, dir: -1 | 1) => void;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  onDuplicate: (track: Track) => void;
  onUpdate: (id: number, field: keyof Track, value: Track[keyof Track]) => void;
  onUpdateClip: (trackId: number, clipId: number, field: keyof Clip, value: number) => void;
  onDeleteClip: (trackId: number, clipId: number) => void;
  onClipDragStart: () => void;
  onContextMenu: (e: React.MouseEvent, trackId: number, clipId?: number) => void;
};

export function TrackItem({
  track,
  isSelected,
  hasSolo,
  globalTime,
  pxPerSec,
  snapSeconds,
  index,
  total,
  onMove,
  onSelect,
  onDelete,
  onDuplicate,
  onUpdate,
  onUpdateClip,
  onDeleteClip,
  onClipDragStart,
  onContextMenu,
}: Props) {
  const trackRef = useRef(track);
  const hasSoloRef = useRef(hasSolo);
  trackRef.current = track;
  hasSoloRef.current = hasSolo;

  const effectiveMute = track.isMuted || (hasSolo && !track.isSolo);

  // ランタイム登録（FX チェーン保持）。
  // register/unregister を同一エフェクトで対にし、StrictMode の二重マウントでも
  // 必ず再登録されるようにする（録音直後のトラックが無音になる不具合の対策）。
  // setClipBuffer 等の利用は decode 後の非同期で走るため、この登録に間に合う。
  const stateRef = useRef({
    getTrack: () => trackRef.current,
    isAudible: () => {
      const t = trackRef.current;
      return !t.isMuted && !(hasSoloRef.current && !t.isSolo);
    },
  });

  useEffect(() => {
    audioEngine.register(track.id, stateRef.current);
    return () => audioEngine.unregister(track.id);
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
    track.deEss,
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
              data-tooltip="上に移動"
              disabled={index === 0}
              onClick={(e) => {
                e.stopPropagation();
                onMove(track.id, -1);
              }}
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              className="tooltip"
              data-tooltip="下に移動"
              disabled={index === total - 1}
              onClick={(e) => {
                e.stopPropagation();
                onMove(track.id, 1);
              }}
            >
              <ChevronDown size={14} />
            </button>
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
            pxPerSec={pxPerSec}
            snapSeconds={snapSeconds}
            onSelect={() => onSelect(track.id)}
            onDragStart={onClipDragStart}
            onUpdateClip={(clipId, field, value) => onUpdateClip(track.id, clipId, field, value)}
            onDeleteClip={(clipId) => onDeleteClip(track.id, clipId)}
            onContextMenu={(e) => {
              e.stopPropagation();
              onContextMenu(e, track.id, clip.id);
            }}
          />
        ))}
      </div>
    </div>
  );
}
