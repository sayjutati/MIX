import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorApi } from "../hooks/useEditor";
import type { EditorState } from "../types";
import { TRACK_HEADER_WIDTH, projectDuration, timelineWorkspaceDuration } from "../types";
import { displayOrderedTracks } from "../utils/timeline";
import { EditToolbar } from "./EditToolbar";
import { TimelineRuler } from "./TimelineRuler";
import { TrackRow } from "./TrackRow";

interface Props {
  state: EditorState;
  editor: EditorApi;
  height: number;
  onResizeHeight: (nextHeight: number) => void;
  onSeek: (time: number) => void;
  onStatus: (msg: string) => void;
  onImportExternalFiles: (files: FileList, targetTrackId?: string, startSec?: number) => void;
}

interface ContextMenuState {
  clipId: string;
  x: number;
  y: number;
}

export const Timeline = ({
  state,
  editor,
  height,
  onResizeHeight,
  onSeek,
  onStatus,
  onImportExternalFiles,
}: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);

  const contentDur = useMemo(
    () => projectDuration(state.clips, state.textClips),
    [state.clips, state.textClips]
  );
  const workspaceDur = useMemo(() => timelineWorkspaceDuration(state), [state]);
  const orderedTracks = useMemo(() => displayOrderedTracks(state.tracks), [state.tracks]);
  const anySolo = state.tracks.some((t) => t.kind === "audio" && t.solo);

  // 再生中はプレイヘッドが画面外に出たらスムーズに自動ページ送り
  useEffect(() => {
    if (!state.isPlaying) return;
    const sc = scrollRef.current;
    if (!sc) return;
    const playheadX = state.playhead * state.pxPerSec;
    const viewLeft = sc.scrollLeft;
    const viewSpan = Math.max(120, sc.clientWidth - TRACK_HEADER_WIDTH);
    if (playheadX > viewLeft + viewSpan - 40) {
      sc.scrollLeft = playheadX - 60;
    } else if (playheadX < viewLeft) {
      sc.scrollLeft = Math.max(0, playheadX - 20);
    }
  }, [state.isPlaying, state.playhead, state.pxPerSec]);

  // コンテキストメニュー外クリックで閉じる
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [ctxMenu]);

  const handleFitZoom = () => {
    const sc = scrollRef.current;
    if (!sc) return;
    const availW = Math.max(240, sc.clientWidth - TRACK_HEADER_WIDTH - 48);
    const targetDur = Math.max(5, contentDur);
    const nextPx = Math.min(240, Math.max(8, Math.floor(availW / targetDur)));
    editor.patch({ pxPerSec: nextPx });
    sc.scrollLeft = 0;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const sc = scrollRef.current;
      if (!sc) return;
      const rect = sc.getBoundingClientRect();
      const cursorLaneX = Math.max(0, e.clientX - rect.left - TRACK_HEADER_WIDTH + sc.scrollLeft);
      const anchorSec = cursorLaneX / state.pxPerSec;
      const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
      const nextPx = Math.min(240, Math.max(8, Math.round(state.pxPerSec * factor)));
      if (nextPx === state.pxPerSec) return;
      editor.patch({ pxPerSec: nextPx });
      requestAnimationFrame(() => {
        const cursorViewportOffset = Math.max(0, e.clientX - rect.left - TRACK_HEADER_WIDTH);
        sc.scrollLeft = Math.max(0, anchorSec * nextPx - cursorViewportOffset);
      });
    }
  };

  const startResizeTimeline = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const onMove = (ev: PointerEvent) => {
      onResizeHeight(startH + (startY - ev.clientY));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const ctxMediaClip = ctxMenu ? state.clips.find((c) => c.id === ctxMenu.clipId) : undefined;

  return (
    <section className="timeline" style={{ height }}>
      <div
        className="timeline__resizer"
        onPointerDown={startResizeTimeline}
        title="ドラッグしてタイムラインの高さを調整"
      />

      <EditToolbar
        state={state}
        editor={editor}
        onStatus={onStatus}
        onFitZoom={handleFitZoom}
      />

      <div
        ref={scrollRef}
        className="timeline__scroll"
        onWheel={handleWheel}
      >
        <div
          className="timeline__canvas"
          style={{ width: TRACK_HEADER_WIDTH + workspaceDur * state.pxPerSec }}
        >
          <TimelineRuler
            duration={workspaceDur}
            contentDuration={contentDur}
            pxPerSec={state.pxPerSec}
            playhead={state.playhead}
            loopA={state.loopA}
            loopB={state.loopB}
            onSeek={onSeek}
          />

          <div className="timeline__tracks">
            {orderedTracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                state={state}
                timelineDuration={workspaceDur}
                editor={editor}
                anySolo={anySolo}
                onSeekTime={onSeek}
                onDropExternalFiles={onImportExternalFiles}
                onClipContextMenu={(clipId, x, y) => setCtxMenu({ clipId, x, y })}
              />
            ))}
          </div>

          {/* マグネット吸着ガイド線 */}
          {editor.snapGuideTime != null && (
            <div
              className="timeline__snap-line"
              style={{ left: TRACK_HEADER_WIDTH + editor.snapGuideTime * state.pxPerSec }}
            />
          )}

          {/* 全トラック貫通プレイヘッド */}
          <div
            className="timeline__playhead"
            style={{ left: TRACK_HEADER_WIDTH + state.playhead * state.pxPerSec }}
          />
        </div>
      </div>

      {/* 右クリックコンテキストメニュー */}
      {ctxMenu && (
        <div
          className="clip-context-menu"
          style={{
            left: Math.min(window.innerWidth - 220, ctxMenu.x),
            top: Math.min(window.innerHeight - 280, ctxMenu.y),
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              editor.splitAtPlayhead();
              setCtxMenu(null);
            }}
          >
            再生位置で分割 <span>S</span>
          </button>
          <button
            type="button"
            onClick={() => {
              editor.trimToPlayhead("start");
              setCtxMenu(null);
            }}
          >
            先頭を再生位置までトリム <span>[</span>
          </button>
          <button
            type="button"
            onClick={() => {
              editor.trimToPlayhead("end");
              setCtxMenu(null);
            }}
          >
            末尾を再生位置までトリム <span>]</span>
          </button>
          <button
            type="button"
            onClick={() => {
              editor.duplicateSelected();
              setCtxMenu(null);
            }}
          >
            複製 <span>Ctrl+D</span>
          </button>

          {ctxMediaClip && (
            <>
              <div className="clip-context-menu__sep" />
              <button
                type="button"
                onClick={() => {
                  editor.toggleClipAudio(ctxMediaClip.id);
                  setCtxMenu(null);
                }}
              >
                {ctxMediaClip.audioMuted ? "音声をオンにする" : "音声をミュート"}
              </button>
              {ctxMediaClip.linkedClipId && (
                <button
                  type="button"
                  onClick={() => {
                    editor.detachLinkedAudio(ctxMediaClip.id);
                    setCtxMenu(null);
                  }}
                >
                  映像と音声のリンクを解除
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  editor.updateClip(ctxMediaClip.id, {
                    transitionOut:
                      ctxMediaClip.transitionOut?.kind === "crossfade"
                        ? { kind: "none", duration: 0 }
                        : { kind: "crossfade", duration: 0.5 },
                  });
                  setCtxMenu(null);
                }}
              >
                {ctxMediaClip.transitionOut?.kind === "crossfade"
                  ? "クロスフェード解除"
                  : "次のクリップへクロスフェード (0.5s)"}
              </button>
            </>
          )}

          <div className="clip-context-menu__sep" />
          <button
            type="button"
            onClick={() => {
              editor.deleteClip(ctxMenu.clipId, false);
              setCtxMenu(null);
            }}
          >
            削除 <span>Del</span>
          </button>
          <button
            type="button"
            className="clip-context-menu__danger"
            onClick={() => {
              editor.deleteClip(ctxMenu.clipId, true);
              setCtxMenu(null);
            }}
          >
            削除して後ろを詰める <span>Shift+Del</span>
          </button>
        </div>
      )}
    </section>
  );
};
