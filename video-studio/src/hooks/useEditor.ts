import { useCallback, useRef, useState } from "react";
import { getLinkedClip } from "../audio/clipAudio";
import { createHistory, pushHistory, redo, undo, type HistoryStack } from "../history";
import { parseDawProject } from "../daw/import";
import { fileToAsset } from "../media/probe";
import { importPPhotoFile } from "../photo/importPhoto";
import { parseCaptions, distributeLyrics, toSrt } from "../text/captions";
import type {
  ClipEffects,
  ClipOrigin,
  ClipTransform,
  EditorState,
  MediaAsset,
  TextClip,
  TimelineClip,
  Track,
  TrackKind,
} from "../types";
import {
  SNAP_GRID_SEC,
  clipTimelineEnd,
  defaultEffects,
  defaultTransform,
  initialEditorState,
  projectDuration,
  resolveTransform,
} from "../types";
import { createTextClip } from "../text/createTextClip";
import { getTelopPreset } from "../text/telopPresets";
import { mergeTextStyle, type TextStyle } from "../text/textStyle";
import { makeClip, makeVideoWithLinkedAudio } from "../utils/clipFactory";
import { snapTime } from "../utils/time";
import {
  canPlaceClip,
  clipsOnTrack,
  computeMagneticStart,
  findFreeStart,
  splitOpacityKeyframes,
  trimDeltaLimits,
} from "../utils/timeline";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const withLinked = (s: EditorState, clipId: string): string[] => {
  const clip = s.clips.find((c) => c.id === clipId);
  if (!clip?.linkedClipId) return [clipId];
  return [clipId, clip.linkedClipId];
};

const firstTrackOfKind = (s: EditorState, kind: TrackKind) =>
  s.tracks.find((t) => t.kind === kind && !t.locked);

const makeAutoTrack = (kind: TrackKind, name: string, color?: string): Track => {
  const defaultColors: Record<TrackKind, string> = {
    video: "#4f8cf7",
    audio: "#22c55e",
    text: "#f59e0b",
    overlay: "#ec4899",
  };
  return {
    id: `${kind[0]}-auto-${uid()}`,
    name,
    kind,
    color: color ?? defaultColors[kind],
    height: kind === "video" ? 64 : kind === "audio" ? 56 : 46,
    locked: false,
    muted: false,
    hidden: false,
    solo: false,
    volume: 1,
    clips: [],
  };
};

/** 初回インポート時に素材の縦横比へキャンバス解像度を自動フィット（長辺最大1920・偶数丸め） */
export const computeSmartCanvasSize = (
  w?: number,
  h?: number
): { previewWidth: number; previewHeight: number } | null => {
  if (!w || !h || w < 16 || h < 16) return null;
  const maxEdge = 1920;
  const scale = Math.max(w, h) > maxEdge ? maxEdge / Math.max(w, h) : 1;
  const even = (n: number) => Math.max(16, Math.round(n / 2) * 2);
  return {
    previewWidth: even(w * scale),
    previewHeight: even(h * scale),
  };
};

export const useEditor = () => {
  const [state, setState] = useState<EditorState>(initialEditorState);
  const [snapGuideTime, setSnapGuideTime] = useState<number | null>(null);
  const histRef = useRef<HistoryStack>(createHistory());
  const gestureActive = useRef(false);
  const clipClipboardRef = useRef<{
    clips: TimelineClip[];
    textClips: TextClip[];
  } | null>(null);

  const beginGesture = useCallback(() => {
    if (gestureActive.current) return;
    setState((prev) => {
      histRef.current = pushHistory(histRef.current, prev);
      gestureActive.current = true;
      return prev;
    });
  }, []);

  const endGesture = useCallback(() => {
    gestureActive.current = false;
    setSnapGuideTime(null);
  }, []);

  const commit = useCallback((updater: (s: EditorState) => EditorState) => {
    setState((prev) => {
      if (!gestureActive.current) {
        histRef.current = pushHistory(histRef.current, prev);
      }
      const next = updater(prev);
      return {
        ...next,
        duration: projectDuration(next.clips, next.textClips),
      };
    });
  }, []);

  const patch = useCallback((partial: Partial<EditorState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const undoAction = useCallback(() => {
    setState((prev) => {
      const r = undo(histRef.current, prev);
      if (!r) return prev;
      histRef.current = r.hist;
      return { ...r.state, duration: projectDuration(r.state.clips, r.state.textClips) };
    });
  }, []);

  const redoAction = useCallback(() => {
    setState((prev) => {
      const r = redo(histRef.current, prev);
      if (!r) return prev;
      histRef.current = r.hist;
      return { ...r.state, duration: projectDuration(r.state.clips, r.state.textClips) };
    });
  }, []);

  const importFiles = useCallback(
    async (
      files: FileList | File[],
      placeOpts?: boolean | { autoPlace?: boolean; targetTrackId?: string; startAt?: number },
      placeAt?: number
    ) => {
      const autoPlace =
        typeof placeOpts === "boolean" ? placeOpts : Boolean(placeOpts?.autoPlace);
      const targetTrackId = typeof placeOpts === "object" ? placeOpts?.targetTrackId : undefined;
      const initialStart =
        typeof placeOpts === "object" ? placeOpts?.startAt : placeAt;

      const list = Array.from(files);
      const newAssets: MediaAsset[] = [];
      const failed: string[] = [];
      for (const f of list) {
        try {
          newAssets.push(await fileToAsset(f));
        } catch {
          failed.push(f.name);
        }
      }
      if (newAssets.length) {
        commit((s) => {
          const wasEmpty = s.clips.length === 0 && s.textClips.length === 0;
          const firstVisual = newAssets.find(
            (a) => (a.kind === "video" || a.kind === "image") && a.width && a.height
          );
          const adapted =
            wasEmpty && firstVisual
              ? computeSmartCanvasSize(firstVisual.width, firstVisual.height)
              : null;

          let next: EditorState = {
            ...s,
            ...(adapted ?? {}),
            assets: [...s.assets, ...newAssets],
          };
          if (autoPlace) {
            let cursor = initialStart ?? (wasEmpty ? 0 : s.playhead);
            for (const asset of newAssets) {
              next = placeAssetIntoState(next, asset, targetTrackId, cursor).state;
              cursor += asset.kind === "image" ? 5 : asset.duration;
            }
          }
          return next;
        });
      }
      return { added: newAssets.length, assets: newAssets, failed };
    },
    [commit]
  );

  const removeAsset = useCallback(
    (assetId: string) => {
      commit((s) => {
        const target = s.assets.find((a) => a.id === assetId);
        if (target?.url.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(target.url);
          } catch {
            /* ignore */
          }
        }
        const removedIds = new Set(
          s.clips.filter((c) => c.assetId === assetId).map((c) => c.id)
        );
        return {
          ...s,
          assets: s.assets.filter((a) => a.id !== assetId),
          clips: s.clips.filter((c) => c.assetId !== assetId),
          selectedClipId: removedIds.has(s.selectedClipId ?? "") ? null : s.selectedClipId,
        };
      });
    },
    [commit]
  );

  const importDaw = useCallback(
    async (file: File) => {
      const text = await file.text();
      const json = JSON.parse(text.replace(/^\uFEFF/, "")) as Parameters<typeof parseDawProject>[0];
      if (!json || !Array.isArray(json.tracks)) throw new Error("DAW プロジェクトではありません");
      const parsed = parseDawProject(json, "__FIRST_DAW_TRACK__");
      if (!parsed.clips.length) {
        throw new Error("取り込める音声がありません（ミュート/空のトラックのみ）");
      }
      commit((s) => {
        const emptyAudio =
          s.tracks.find(
            (t) =>
              t.id === "a2" &&
              t.kind === "audio" &&
              !t.locked &&
              !s.clips.some((c) => c.trackId === t.id)
          ) ??
          s.tracks.find(
            (t) => t.kind === "audio" && !t.locked && !s.clips.some((c) => c.trackId === t.id)
          );

        const createdFirst = emptyAudio
          ? null
          : makeAutoTrack("audio", `DAW: ${file.name.replace(/\.daw$/i, "") || "Track 1"}`, "#a855f7");
        const firstTrackId = emptyAudio ? emptyAudio.id : createdFirst!.id;

        const mappedClips = parsed.clips.map((c) =>
          c.trackId === "__FIRST_DAW_TRACK__" ? { ...c, trackId: firstTrackId } : c
        );
        const addedTracks = [
          ...(createdFirst ? [createdFirst] : []),
          ...parsed.extraTracks,
        ];

        return {
          ...s,
          tracks: [...s.tracks, ...addedTracks],
          assets: [...s.assets, ...parsed.assets],
          clips: [...s.clips, ...mappedClips],
          selectedClipId: mappedClips[0]?.id ?? s.selectedClipId,
          selectedTrackId: firstTrackId,
        };
      });
      return {
        trackCount: parsed.extraTracks.length + 1,
        clipCount: parsed.clips.length,
        hasUnbakedFx: parsed.hasUnbakedFx,
      };
    },
    [commit]
  );

  const importAudioOntoTrack = useCallback(
    async (
      file: File,
      trackId = "a2",
      origin: ClipOrigin = "daw",
      desiredStart = 0,
      trackLabel?: string
    ) => {
      const asset = await fileToAsset(file);
      commit((s) => {
        const duration = asset.duration || 1;
        const preferred = s.tracks.find((t) => t.id === trackId && t.kind === "audio" && !t.locked);
        // 0:00 同期を崩さないよう、指定位置に置ける空き音声トラックを優先し、無ければ新規音声トラックを作る
        let targetTrack =
          preferred && canPlaceClip(s.clips, preferred.id, desiredStart, duration)
            ? preferred
            : s.tracks.find(
                (t) =>
                  t.kind === "audio" &&
                  !t.locked &&
                  canPlaceClip(s.clips, t.id, desiredStart, duration)
              );

        const nextTracks = [...s.tracks];
        if (!targetTrack) {
          targetTrack = makeAutoTrack(
            "audio",
            trackLabel || (origin === "daw" ? "DAW ミックス" : "外部音声"),
            "#a855f7"
          );
          nextTracks.push(targetTrack);
        }

        const clip = makeClip(asset, targetTrack.id, Math.max(0, desiredStart), { origin });
        return {
          ...s,
          tracks: nextTracks,
          assets: [...s.assets, asset],
          clips: [...s.clips, clip],
          selectedClipId: clip.id,
          selectedTrackId: targetTrack.id,
        };
      });
    },
    [commit]
  );

  const placeOverlayAsset = (s: EditorState, asset: MediaAsset, matchProjectSpan: boolean): EditorState => {
    const wasEmpty = s.clips.length === 0 && s.textClips.length === 0;
    const existingEnd = wasEmpty ? 0 : projectDuration(s.clips, s.textClips);
    const duration = matchProjectSpan && existingEnd > 0 ? Math.max(5, existingEnd) : 5;
    const desiredStart = matchProjectSpan && existingEnd > 0 ? 0 : wasEmpty ? 0 : s.playhead;

    let targetTrack = s.tracks.find(
      (t) =>
        t.kind === "overlay" &&
        !t.locked &&
        canPlaceClip(s.clips, t.id, desiredStart, duration)
    );
    const nextTracks = [...s.tracks];
    if (!targetTrack) {
      targetTrack = makeAutoTrack("overlay", `オーバーレイ ${nextTracks.filter((t) => t.kind === "overlay").length + 1}`);
      // オーバーレイは映像トラックより上（配列の後ろまたは既存 overlay の直後）に追加
      nextTracks.push(targetTrack);
    }

    const adapted =
      wasEmpty && asset.width && asset.height
        ? computeSmartCanvasSize(asset.width, asset.height)
        : null;
    const clip = {
      ...makeClip(asset, targetTrack.id, Math.max(0, desiredStart)),
      duration,
    };
    return {
      ...s,
      ...(adapted ?? {}),
      tracks: nextTracks,
      assets: [...s.assets, asset],
      clips: [...s.clips, clip],
      selectedClipId: clip.id,
      selectedTrackId: targetTrack.id,
    };
  };

  const importImageOntoOverlay = useCallback(
    async (file: File, matchProjectSpan = true) => {
      const asset = await fileToAsset(file);
      commit((s) => placeOverlayAsset(s, asset, matchProjectSpan));
    },
    [commit]
  );

  const importPPhoto = useCallback(
    async (file: File) => {
      const asset = await importPPhotoFile(file);
      commit((s) => placeOverlayAsset(s, asset, true));
    },
    [commit]
  );

  const importCaptions = useCallback(
    (text: string) => {
      const preset = getTelopPreset("lyric-bottom");
      let cues = parseCaptions(text);
      if (!cues.length) {
        const hasClips = state.clips.length > 0 || state.textClips.length > 0;
        const span = hasClips ? Math.max(8, projectDuration(state.clips, state.textClips)) : 16;
        cues = distributeLyrics(text, 0, span);
      }
      if (!cues.length) throw new Error("歌詞・字幕を読み取れませんでした");

      // 同一ファイル内の順序と微小重複を正規化
      const sorted = [...cues].sort((a, b) => a.start - b.start);
      const normalized: typeof sorted = [];
      for (let i = 0; i < sorted.length; i++) {
        const cur = sorted[i]!;
        const next = sorted[i + 1];
        const start = Math.max(0, cur.start);
        const rawEnd = Math.max(start + 0.3, cur.end);
        const end = next && next.start > start + 0.2 ? Math.min(rawEnd, next.start) : rawEnd;
        normalized.push({ start, end: Math.max(start + 0.2, end), text: cur.text });
      }

      commit((s) => {
        let track = s.tracks.find(
          (t) =>
            t.kind === "text" &&
            !t.locked &&
            !s.textClips.some((tc) => tc.trackId === t.id)
        );
        const nextTracks = [...s.tracks];
        if (!track) {
          track = makeAutoTrack(
            "text",
            `歌詞・字幕 ${nextTracks.filter((t) => t.kind === "text").length + 1}`
          );
          nextTracks.push(track);
        }

        const clips = normalized.map((c) =>
          createTextClip({
            trackId: track!.id,
            start: c.start,
            duration: Math.max(0.2, c.end - c.start),
            text: c.text,
            x: preset?.x ?? 0.5,
            y: preset?.y ?? 0.82,
            style: preset ? { ...preset.style } : undefined,
          })
        );
        return {
          ...s,
          tracks: nextTracks,
          textClips: [...s.textClips, ...clips],
          selectedClipId: clips[0]?.id ?? s.selectedClipId,
          selectedTrackId: track.id,
        };
      });
      return normalized.length;
    },
    [commit, state.clips, state.textClips]
  );

  const exportCaptionsSrt = useCallback((): string => {
    const cues = state.textClips.map((c) => ({
      start: c.start,
      end: c.start + c.duration,
      text: c.text,
    }));
    return toSrt(cues);
  }, [state.textClips]);

  /** 画像・テロップクリップを作品全体（他クリップの終端）の長さに一発フィットさせる */
  const fitClipToProject = useCallback(
    (clipId: string): boolean => {
      let fitted = false;
      commit((s) => {
        const textTarget = s.textClips.find((c) => c.id === clipId);
        const mediaTarget = s.clips.find((c) => c.id === clipId);
        const target = textTarget ?? mediaTarget;
        if (!target) return s;

        if (mediaTarget) {
          const asset = s.assets.find((a) => a.id === mediaTarget.assetId);
          if (!asset || asset.kind !== "image") return s;
        }

        const othersEnd = [...s.clips, ...s.textClips]
          .filter((c) => c.id !== clipId)
          .reduce((m, c) => Math.max(m, clipTimelineEnd(c)), 0);
        const desiredEnd = othersEnd > 0.5 ? othersEnd : Math.max(10, clipTimelineEnd(target));

        const siblings = (textTarget ? s.textClips : s.clips).filter(
          (c) => c.trackId === target.trackId && c.id !== clipId
        );
        // 0:00 から desiredEnd まで同トラックに他のクリップがなければ 0..desiredEnd、あれば前後の境界内に広げる
        let newStart = 0;
        let newEnd = desiredEnd;
        for (const sib of siblings) {
          const sibEnd = clipTimelineEnd(sib);
          if (sibEnd <= target.start + 1e-4) {
            newStart = Math.max(newStart, sibEnd);
          } else if (sib.start >= clipTimelineEnd(target) - 1e-4) {
            newEnd = Math.min(newEnd, sib.start);
          }
        }
        const newDur = Math.max(0.2, newEnd - newStart);
        fitted = true;

        if (textTarget) {
          return {
            ...s,
            textClips: s.textClips.map((c) =>
              c.id === clipId ? { ...c, start: newStart, duration: newDur } : c
            ),
          };
        }
        return {
          ...s,
          clips: s.clips.map((c) =>
            c.id === clipId ? { ...c, start: newStart, duration: newDur } : c
          ),
        };
      });
      return fitted;
    },
    [commit]
  );

  const addClipFromAsset = useCallback(
    (assetId: string, trackId?: string, at?: number): { ok: boolean; reason?: string } => {
      let result: { ok: boolean; reason?: string } = { ok: false, reason: "配置できませんでした" };
      commit((s) => {
        const track = trackId ? s.tracks.find((t) => t.id === trackId) : undefined;
        if (track?.kind === "text") {
          const desired = snapTime(at ?? s.playhead, SNAP_GRID_SEC, s.snapEnabled);
          const start = findFreeStart(s.textClips, [{ trackId: track.id, duration: 4 }], desired);
          const textClip = createTextClip({ trackId: track.id, start });
          result = { ok: true };
          return { ...s, textClips: [...s.textClips, textClip], selectedClipId: textClip.id };
        }

        const asset = s.assets.find((a) => a.id === assetId);
        if (!asset) {
          result = { ok: false, reason: "素材が見つかりません" };
          return s;
        }
        const placed = placeAssetIntoState(s, asset, trackId, at);
        result = placed.result;
        return placed.state;
      });
      return result;
    },
    [commit]
  );

  /**
   * クリップ移動（映像・音声・オーバーレイ・テロップ全対応 + 同一種別トラック間移動 + マグネット吸着）
   */
  const moveClip = useCallback(
    (clipId: string, rawNewStart: number, newTrackId?: string, disableSnap = false) => {
      let nextGuide: number | null = null;
      commit((s) => {
        const textTarget = s.textClips.find((c) => c.id === clipId);
        if (textTarget) {
          const curTrack = s.tracks.find((t) => t.id === textTarget.trackId);
          if (curTrack?.locked) return s;
          const destTrack =
            newTrackId && s.tracks.find((t) => t.id === newTrackId && t.kind === "text" && !t.locked)
              ? newTrackId
              : textTarget.trackId;
          const mag = computeMagneticStart({
            rawStart: rawNewStart,
            duration: textTarget.duration,
            pxPerSec: s.pxPerSec,
            snapEnabled: s.snapEnabled && !disableSnap,
            playhead: s.playhead,
            loopA: s.loopA,
            loopB: s.loopB,
            clips: s.clips,
            textClips: s.textClips,
            excludeIds: new Set([clipId]),
          });
          nextGuide = mag.guideTime;
          let finalStart = mag.start;
          if (!canPlaceClip(s.textClips, destTrack, finalStart, textTarget.duration, clipId)) {
            finalStart = resolveNearestNonOverlappingStart(
              s.textClips,
              destTrack,
              finalStart,
              textTarget.duration,
              new Set([clipId])
            );
            nextGuide = null;
          }
          return {
            ...s,
            textClips: s.textClips.map((c) =>
              c.id === clipId ? { ...c, start: finalStart, trackId: destTrack } : c
            ),
          };
        }

        const primary = s.clips.find((c) => c.id === clipId);
        if (!primary) return s;
        const primaryTrack = s.tracks.find((t) => t.id === primary.trackId);
        if (primaryTrack?.locked) return s;

        const ids = withLinked(s, clipId);
        const idSet = new Set(ids);

        const mag = computeMagneticStart({
          rawStart: rawNewStart,
          duration: primary.duration,
          pxPerSec: s.pxPerSec,
          snapEnabled: s.snapEnabled && !disableSnap,
          playhead: s.playhead,
          loopA: s.loopA,
          loopB: s.loopB,
          clips: s.clips,
          textClips: s.textClips,
          excludeIds: idSet,
        });
        nextGuide = mag.guideTime;

        const destPrimaryTrack =
          newTrackId &&
          s.tracks.find(
            (t) => t.id === newTrackId && t.kind === primaryTrack?.kind && !t.locked
          )
            ? newTrackId
            : primary.trackId;

        let delta = mag.start - primary.start;
        // リンクされた相手も含め負の時刻にならないようクランプ
        for (const c of s.clips) {
          if (idSet.has(c.id)) delta = Math.max(delta, -c.start);
        }

        const canAllMove = (d: number, pTrack: string) =>
          s.clips
            .filter((c) => idSet.has(c.id))
            .every((c) => {
              const tid = c.id === clipId ? pTrack : c.trackId;
              return canPlaceClip(s.clips, tid, c.start + d, c.duration, idSet);
            });

        let appliedTrack = destPrimaryTrack;
        if (!canAllMove(delta, appliedTrack)) {
          // トラック変更先が塞がっているなら元トラックでの移動を試す
          if (appliedTrack !== primary.trackId && canAllMove(delta, primary.trackId)) {
            appliedTrack = primary.trackId;
          } else {
            // 最も近い非重複エッジへピタッと吸着させる
            const nearest = resolveNearestNonOverlappingStart(
              s.clips,
              appliedTrack,
              primary.start + delta,
              primary.duration,
              idSet
            );
            const candDelta = nearest - primary.start;
            if (canAllMove(candDelta, appliedTrack)) {
              delta = candDelta;
              nextGuide = null;
            } else {
              return s;
            }
          }
        }

        return {
          ...s,
          clips: s.clips.map((c) => {
            if (!idSet.has(c.id)) return c;
            return {
              ...c,
              start: Math.max(0, c.start + delta),
              trackId: c.id === clipId ? appliedTrack : c.trackId,
            };
          }),
        };
      });
      setSnapGuideTime(nextGuide);
    },
    [commit]
  );

  /**
   * 絶対目標時刻ベースのトリム（カーソルずれゼロ + マグネット吸着対応）
   */
  const trimClipTo = useCallback(
    (
      clipId: string,
      edge: "start" | "end",
      rawTargetTime: number,
      disableSnap = false
    ) => {
      let nextGuide: number | null = null;
      commit((s) => {
        const ids = withLinked(s, clipId);
        const idSet = new Set(ids);
        const isText = s.textClips.some((c) => c.id === clipId);

        let snappedTarget = Math.max(0, rawTargetTime);
        if (s.snapEnabled && !disableSnap) {
          const thresholdSec = Math.min(0.35, Math.max(0.04, 10 / Math.max(8, s.pxPerSec)));
          const anchors: number[] = [0, s.playhead];
          if (s.loopA != null) anchors.push(s.loopA);
          if (s.loopB != null) anchors.push(s.loopB);
          for (const c of [...s.clips, ...s.textClips]) {
            if (idSet.has(c.id)) continue;
            anchors.push(c.start, clipTimelineEnd(c));
          }
          let bestD = Infinity;
          for (const a of anchors) {
            const d = Math.abs(snappedTarget - a);
            if (d <= thresholdSec && d < bestD) {
              bestD = d;
              snappedTarget = a;
              nextGuide = a;
            }
          }
        }

        const current = isText
          ? s.textClips.find((c) => c.id === clipId)
          : s.clips.find((c) => c.id === clipId);
        if (!current) return s;

        const desiredFromCurrent =
          edge === "start"
            ? snappedTarget - current.start
            : snappedTarget - (current.start + current.duration);

        const assetMap = new Map(s.assets.map((a) => [a.id, a]));
        const maxSourceOf = (c: TimelineClip) => {
          if (isText) return Infinity;
          const a = assetMap.get(c.assetId);
          if (!a || a.kind === "image") return Infinity;
          return a.duration || Infinity;
        };

        let delta = desiredFromCurrent;
        if (isText) {
          const { min, max } = trimDeltaLimits(s.textClips, current, edge, Infinity);
          delta = Math.max(min, Math.min(max, delta));
        } else {
          for (const c of s.clips) {
            if (!idSet.has(c.id)) continue;
            const { min, max } = trimDeltaLimits(s.clips, c, edge, maxSourceOf(c));
            delta = Math.max(min, Math.min(max, delta));
          }
        }

        const patchOne = (c: TimelineClip): TimelineClip => {
          if (!idSet.has(c.id)) return c;
          if (edge === "start") {
            return {
              ...c,
              start: c.start + delta,
              inPoint: isText ? 0 : Math.max(0, c.inPoint + delta * (c.speed || 1)),
              duration: Math.max(0.1, c.duration - delta),
            };
          }
          return { ...c, duration: Math.max(0.1, c.duration + delta) };
        };

        if (isText) {
          return {
            ...s,
            textClips: s.textClips.map((c) =>
              c.id === clipId ? ({ ...c, ...patchOne(c) } as TextClip) : c
            ),
          };
        }
        return { ...s, clips: s.clips.map(patchOne) };
      });
      setSnapGuideTime(nextGuide);
    },
    [commit]
  );

  const trimClip = useCallback(
    (clipId: string, edge: "start" | "end", deltaSec: number) => {
      commit((s) => {
        const ids = withLinked(s, clipId);
        const isText = s.textClips.some((c) => c.id === clipId);
        const assetMap = new Map(s.assets.map((a) => [a.id, a]));
        const maxSourceOf = (c: TimelineClip) => {
          if (isText) return Infinity;
          const a = assetMap.get(c.assetId);
          if (!a || a.kind === "image") return Infinity;
          return a.duration || Infinity;
        };

        let delta = deltaSec;
        if (isText) {
          const tc = s.textClips.find((c) => c.id === clipId);
          if (!tc) return s;
          const { min, max } = trimDeltaLimits(s.textClips, tc, edge, Infinity);
          delta = Math.max(min, Math.min(max, delta));
        } else {
          for (const c of s.clips) {
            if (!ids.includes(c.id)) continue;
            const { min, max } = trimDeltaLimits(s.clips, c, edge, maxSourceOf(c));
            delta = Math.max(min, Math.min(max, delta));
          }
        }

        const patchOne = (c: TimelineClip): TimelineClip => {
          if (!ids.includes(c.id)) return c;
          if (edge === "start") {
            const ds = isText ? Math.min(delta, c.duration - 0.1) : delta;
            return {
              ...c,
              start: c.start + ds,
              inPoint: isText ? 0 : Math.max(0, c.inPoint + ds * c.speed),
              duration: c.duration - ds,
            };
          }
          return { ...c, duration: Math.max(0.1, c.duration + delta) };
        };
        if (isText) {
          return {
            ...s,
            textClips: s.textClips.map((c) =>
              c.id === clipId ? ({ ...c, ...patchOne(c) } as TextClip) : c
            ),
          };
        }
        return { ...s, clips: s.clips.map(patchOne) };
      });
    },
    [commit]
  );

  /** 再生ヘッド位置へ選択クリップの先頭 (`[`) または末尾 (`]`) を一発トリム */
  const trimToPlayhead = useCallback(
    (edge: "start" | "end"): boolean => {
      let changed = false;
      commit((s) => {
        const t = s.playhead;
        const all = [...s.clips, ...s.textClips];
        const under = (c: TimelineClip) => t > c.start + 0.05 && t < clipTimelineEnd(c) - 0.05;
        const target =
          all.find((c) => c.id === s.selectedClipId && under(c)) ??
          all.find((c) => c.id === s.selectedClipId) ??
          all.find(under);
        if (!target) return s;

        const isText = s.textClips.some((c) => c.id === target.id);
        const ids = withLinked(s, target.id);
        const delta = edge === "start" ? t - target.start : t - clipTimelineEnd(target);
        if (Math.abs(delta) < 0.01) return s;

        const assetMap = new Map(s.assets.map((a) => [a.id, a]));
        const maxSourceOf = (c: TimelineClip) => {
          if (isText) return Infinity;
          const a = assetMap.get(c.assetId);
          if (!a || a.kind === "image") return Infinity;
          return a.duration || Infinity;
        };

        let clamped = delta;
        if (isText) {
          const { min, max } = trimDeltaLimits(s.textClips, target, edge, Infinity);
          clamped = Math.max(min, Math.min(max, clamped));
        } else {
          for (const c of s.clips) {
            if (!ids.includes(c.id)) continue;
            const { min, max } = trimDeltaLimits(s.clips, c, edge, maxSourceOf(c));
            clamped = Math.max(min, Math.min(max, clamped));
          }
        }
        if (Math.abs(clamped) < 0.005) return s;
        changed = true;

        const patchOne = (c: TimelineClip): TimelineClip => {
          if (!ids.includes(c.id)) return c;
          if (edge === "start") {
            return {
              ...c,
              start: c.start + clamped,
              inPoint: isText ? 0 : Math.max(0, c.inPoint + clamped * (c.speed || 1)),
              duration: Math.max(0.1, c.duration - clamped),
            };
          }
          return { ...c, duration: Math.max(0.1, c.duration + clamped) };
        };

        if (isText) {
          return {
            ...s,
            textClips: s.textClips.map((c) =>
              c.id === target.id ? ({ ...c, ...patchOne(c) } as TextClip) : c
            ),
          };
        }
        return { ...s, clips: s.clips.map(patchOne) };
      });
      return changed;
    },
    [commit]
  );

  const splitAtPlayhead = useCallback((): boolean => {
    let didSplit = false;
    commit((s) => {
      const t = s.playhead;
      const under = (c: TimelineClip) => t > c.start + 0.05 && t < clipTimelineEnd(c) - 0.05;
      const all = [...s.clips, ...s.textClips];
      const target = all.find((c) => c.id === s.selectedClipId && under(c)) ?? all.find(under);
      if (!target) return s;
      const track = s.tracks.find((tr) => tr.id === target.trackId);
      if (track?.locked) return s;

      didSplit = true;
      const local = t - target.start;
      const rightId = uid();
      const linked = getLinkedClip(s, target.id);
      const rightLinkedId = linked ? uid() : undefined;

      const splitOne = (c: TimelineClip, newRightId: string, linkTo?: string): [TimelineClip, TimelineClip] => {
        const { transitionOut: _tail, ...head } = c;
        const rightDur = c.duration - local;
        // 分割点では勝手にフェードイン/アウトしないよう、前半は fadeIn のみ、後半は fadeOut のみ引き継ぐ
        const left: TimelineClip = {
          ...head,
          duration: local,
          fadeIn: Math.min(local, c.fadeIn ?? 0),
          fadeOut: 0,
        };
        const right: TimelineClip = {
          ...c,
          id: newRightId,
          start: t,
          duration: rightDur,
          inPoint: c.inPoint + local * (c.speed || 1),
          fadeIn: 0,
          fadeOut: Math.min(rightDur, c.fadeOut ?? 0),
          linkedClipId: linkTo,
          opacityKeyframes: splitOpacityKeyframes(c, local, uid),
        };
        return [left, right];
      };

      if (s.textClips.some((c) => c.id === target.id)) {
        const [left, right] = splitOne(target, rightId);
        const styleCopy = structuredClone((target as TextClip).style);
        return {
          ...s,
          selectedClipId: rightId,
          textClips: [
            ...s.textClips.filter((c) => c.id !== target.id),
            { ...(left as TextClip), style: styleCopy },
            { ...(right as TextClip), style: structuredClone(styleCopy) },
          ],
        };
      }

      const ids = withLinked(s, target.id);
      const others = s.clips.filter((c) => !ids.includes(c.id));
      const toSplit = s.clips.filter((c) => ids.includes(c.id));
      const newClips: TimelineClip[] = [];

      if (linked && toSplit.length === 2) {
        const video = toSplit.find((c) => s.tracks.find((tr) => tr.id === c.trackId)?.kind === "video")!;
        const audio = toSplit.find((c) => s.tracks.find((tr) => tr.id === c.trackId)?.kind === "audio")!;
        const [vL, vR] = splitOne(video, rightId, rightLinkedId);
        const [aL, aR] = splitOne(audio, rightLinkedId!, rightId);
        vL.linkedClipId = aL.id;
        aL.linkedClipId = vL.id;
        vR.linkedClipId = aR.id;
        aR.linkedClipId = vR.id;
        newClips.push(vL, vR, aL, aR);
      } else {
        const [left, right] = splitOne(target, rightId);
        newClips.push(left, right);
      }

      return { ...s, selectedClipId: rightId, clips: [...others, ...newClips] };
    });
    return didSplit;
  }, [commit]);

  const deleteClip = useCallback(
    (clipId?: string, forceRipple?: boolean) => {
      commit((s) => {
        const targetId = clipId ?? s.selectedClipId;
        if (!targetId) return s;
        const ripple = forceRipple ?? !!s.rippleMode;
        const textTarget = s.textClips.find((c) => c.id === targetId);
        if (textTarget) {
          const track = s.tracks.find((tr) => tr.id === textTarget.trackId);
          if (track?.locked) return s;
          const shift = textTarget.duration;
          const cutEnd = clipTimelineEnd(textTarget);
          const remaining = s.textClips
            .filter((c) => c.id !== targetId)
            .map((c) =>
              ripple && c.trackId === textTarget.trackId && c.start >= cutEnd - 1e-4
                ? { ...c, start: Math.max(0, c.start - shift) }
                : c
            );
          return {
            ...s,
            textClips: remaining,
            selectedClipId: s.selectedClipId === targetId ? null : s.selectedClipId,
          };
        }

        const primary = s.clips.find((c) => c.id === targetId);
        if (!primary) return s;
        const ids = new Set(withLinked(s, targetId));
        const removedByTrack = new Map<string, { end: number; dur: number }>();
        for (const c of s.clips) {
          if (ids.has(c.id)) {
            removedByTrack.set(c.trackId, { end: clipTimelineEnd(c), dur: c.duration });
          }
        }

        const remaining = s.clips
          .filter((c) => !ids.has(c.id))
          .map((c) => {
            if (!ripple) return c;
            const rem = removedByTrack.get(c.trackId);
            const tr = s.tracks.find((t) => t.id === c.trackId);
            if (rem && !tr?.locked && c.start >= rem.end - 1e-4) {
              return { ...c, start: Math.max(0, c.start - rem.dur) };
            }
            return c;
          });

        return {
          ...s,
          clips: remaining,
          selectedClipId: ids.has(s.selectedClipId ?? "") ? null : s.selectedClipId,
        };
      });
    },
    [commit]
  );

  /** トラック内（未指定なら選択トラックまたはメイン映像トラック）の隙間を一括で詰める */
  const closeGaps = useCallback(
    (trackId?: string) => {
      commit((s) => {
        const targetTrackId =
          trackId ??
          s.selectedTrackId ??
          s.clips.find((c) => c.id === s.selectedClipId)?.trackId ??
          s.tracks.find((t) => t.kind === "video")?.id;
        if (!targetTrackId) return s;
        const tr = s.tracks.find((t) => t.id === targetTrackId);
        if (!tr || tr.locked) return s;

        if (tr.kind === "text") {
          const ordered = clipsOnTrack(s.textClips, tr.id);
          let cursor = 0;
          const starts = new Map<string, number>();
          for (const c of ordered) {
            starts.set(c.id, cursor);
            cursor += c.duration;
          }
          return {
            ...s,
            textClips: s.textClips.map((c) =>
              starts.has(c.id) ? { ...c, start: starts.get(c.id)! } : c
            ),
          };
        }

        const ordered = clipsOnTrack(s.clips, tr.id);
        let cursor = 0;
        const shifts = new Map<string, number>();
        for (const c of ordered) {
          const delta = cursor - c.start;
          shifts.set(c.id, delta);
          if (c.linkedClipId) shifts.set(c.linkedClipId, delta);
          cursor += c.duration;
        }
        return {
          ...s,
          clips: s.clips.map((c) =>
            shifts.has(c.id) ? { ...c, start: Math.max(0, c.start + shifts.get(c.id)!) } : c
          ),
        };
      });
    },
    [commit]
  );

  const duplicateClip = useCallback(
    (clipId: string) => {
      commit((s) => {
        const c = [...s.clips, ...s.textClips].find((x) => x.id === clipId);
        if (!c) return s;
        if (s.textClips.some((x) => x.id === clipId)) {
          const src = c as TextClip;
          const start = findFreeStart(
            s.textClips,
            [{ trackId: src.trackId, duration: src.duration }],
            clipTimelineEnd(src)
          );
          const copy: TextClip = {
            ...structuredClone(src),
            id: uid(),
            start,
            style: structuredClone(src.style),
          };
          return { ...s, textClips: [...s.textClips, copy], selectedClipId: copy.id };
        }
        const src = c as TimelineClip;
        const copyId = uid();
        const linked = getLinkedClip(s, clipId);
        const start = findFreeStart(
          s.clips,
          [
            { trackId: src.trackId, duration: src.duration },
            ...(linked ? [{ trackId: linked.trackId, duration: linked.duration }] : []),
          ],
          clipTimelineEnd(src)
        );
        const copy: TimelineClip = {
          ...structuredClone(src),
          id: copyId,
          start,
          linkedClipId: undefined,
        };
        if (linked) {
          const copy2: TimelineClip = {
            ...structuredClone(linked),
            id: uid(),
            start: copy.start,
            linkedClipId: copyId,
          };
          copy.linkedClipId = copy2.id;
          return { ...s, clips: [...s.clips, copy, copy2], selectedClipId: copy.id };
        }
        return { ...s, clips: [...s.clips, copy], selectedClipId: copy.id };
      });
    },
    [commit]
  );

  const updateClip = useCallback(
    (clipId: string, patch: Partial<TimelineClip> | Partial<TextClip>) => {
      commit((s) => {
        const ids = withLinked(s, clipId);
        const syncKeys = ["start", "duration", "inPoint", "speed"] as const;

        if (s.textClips.some((c) => c.id === clipId)) {
          return {
            ...s,
            textClips: s.textClips.map((c) =>
              c.id === clipId ? { ...c, ...patch } : c
            ),
          };
        }

        // speed 単体変更時はソース区間を保ったままタイムライン duration も連動調整する
        const target = s.clips.find((c) => c.id === clipId);
        let computedPatch: Partial<TimelineClip> = { ...(patch as Partial<TimelineClip>) };
        if (target && "speed" in computedPatch && !("duration" in computedPatch)) {
          const newSpeed = Math.max(0.25, Math.min(4, computedPatch.speed || 1));
          const oldSpeed = target.speed || 1;
          const sourceSpan = target.duration * oldSpeed;
          const desiredDur = Math.max(0.1, sourceSpan / newSpeed);
          // 後続クリップに重ならない最大長にクランプ
          const idSet = new Set(ids);
          let maxAllowed = desiredDur;
          for (const c of s.clips) {
            if (!idSet.has(c.id)) continue;
            const next = clipsOnTrack(s.clips, c.trackId).find(
              (o) => !idSet.has(o.id) && o.start >= c.start + c.duration - 1e-5
            );
            if (next) maxAllowed = Math.min(maxAllowed, Math.max(0.1, next.start - c.start));
          }
          computedPatch = { ...computedPatch, speed: newSpeed, duration: maxAllowed };
        }

        const shouldSync = syncKeys.some((k) => k in computedPatch);

        return {
          ...s,
          clips: s.clips.map((c) => {
            if (c.id === clipId) return { ...c, ...computedPatch };
            if (shouldSync && ids.includes(c.id) && c.id !== clipId) {
              const synced: Partial<TimelineClip> = {};
              for (const k of syncKeys) {
                if (k in computedPatch) synced[k] = computedPatch[k] as never;
              }
              return { ...c, ...synced };
            }
            return c;
          }),
        };
      });
    },
    [commit]
  );

  const updateTransform = useCallback(
    (clipId: string, patchTr: Partial<ClipTransform>) => {
      commit((s) => ({
        ...s,
        clips: s.clips.map((c) =>
          c.id === clipId
            ? { ...c, transform: { ...resolveTransform(c), ...patchTr } }
            : c
        ),
      }));
    },
    [commit]
  );

  const resetTransform = useCallback(
    (clipId: string) => {
      commit((s) => ({
        ...s,
        clips: s.clips.map((c) =>
          c.id === clipId ? { ...c, transform: defaultTransform() } : c
        ),
      }));
    },
    [commit]
  );

  const resetEffects = useCallback(
    (clipId: string) => {
      commit((s) => ({
        ...s,
        clips: s.clips.map((c) =>
          c.id === clipId ? { ...c, effects: defaultEffects() } : c
        ),
      }));
    },
    [commit]
  );

  const toggleClipAudio = useCallback(
    (clipId: string) => {
      commit((s) => {
        const clip = s.clips.find((c) => c.id === clipId);
        if (!clip) return s;
        const next = !clip.audioMuted;
        const ids = new Set(withLinked(s, clipId));
        return {
          ...s,
          clips: s.clips.map((c) =>
            ids.has(c.id) ? { ...c, audioMuted: next } : c
          ),
        };
      });
    },
    [commit]
  );

  const detachLinkedAudio = useCallback(
    (clipId: string) => {
      commit((s) => ({
        ...s,
        clips: s.clips.map((c) => {
          if (c.id !== clipId && c.linkedClipId !== clipId) return c;
          return { ...c, linkedClipId: undefined };
        }),
      }));
    },
    [commit]
  );

  const updateEffects = useCallback(
    (clipId: string, effects: Partial<ClipEffects>) => {
      commit((s) => ({
        ...s,
        clips: s.clips.map((c) =>
          c.id === clipId ? { ...c, effects: { ...c.effects, ...effects } } : c
        ),
      }));
    },
    [commit]
  );

  const setTransition = useCallback(
    (clipId: string, kind: "none" | "crossfade", duration = 0.5) => {
      updateClip(clipId, {
        transitionOut: kind === "none" ? undefined : { kind: "crossfade", duration },
      });
    },
    [updateClip]
  );

  const toggleTrack = useCallback(
    (trackId: string, key: "muted" | "hidden" | "locked") => {
      commit((s) => ({
        ...s,
        tracks: s.tracks.map((t) =>
          t.id === trackId ? { ...t, [key]: !t[key] } : t
        ),
      }));
    },
    [commit]
  );

  const toggleSolo = useCallback(
    (trackId: string) => {
      commit((s) => {
        const target = s.tracks.find((t) => t.id === trackId);
        if (!target) return s;
        const nextSolo = !target.solo;
        return {
          ...s,
          tracks: s.tracks.map((t) =>
            t.id === trackId ? { ...t, solo: nextSolo } : { ...t, solo: false }
          ),
        };
      });
    },
    [commit]
  );

  const setTrackVolume = useCallback(
    (trackId: string, volume: number) => {
      commit((s) => ({
        ...s,
        tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, volume } : t)),
      }));
    },
    [commit]
  );

  const addTrack = useCallback(
    (kind: TrackKind) => {
      commit((s) => {
        const n = s.tracks.filter((t) => t.kind === kind).length + 1;
        const colors: Record<TrackKind, string> = {
          video: "#4f8cf7",
          audio: "#22c55e",
          text: "#f59e0b",
          overlay: "#ec4899",
        };
        const names: Record<TrackKind, string> = {
          video: "映像",
          audio: "音声",
          text: "テロップ",
          overlay: "オーバーレイ",
        };
        const id = `${kind[0]}${n}-${uid()}`;
        return {
          ...s,
          tracks: [
            ...s.tracks,
            {
              id,
              name: `${names[kind]} ${n}`,
              kind,
              color: colors[kind],
              height: kind === "video" ? 64 : kind === "audio" ? 56 : 46,
              locked: false,
              muted: false,
              hidden: false,
              solo: false,
              volume: 1,
              clips: [],
            },
          ],
        };
      });
    },
    [commit]
  );

  const removeTrack = useCallback(
    (trackId: string) => {
      commit((s) => ({
        ...s,
        tracks: s.tracks.filter((t) => t.id !== trackId),
        clips: s.clips.filter((c) => c.trackId !== trackId),
        textClips: s.textClips.filter((c) => c.trackId !== trackId),
      }));
    },
    [commit]
  );

  const updateTextStyle = useCallback(
    (clipId: string, patch: Partial<TextStyle>) => {
      commit((s) => ({
        ...s,
        textClips: s.textClips.map((c) =>
          c.id === clipId ? { ...c, style: mergeTextStyle(c.style, patch) } : c
        ),
      }));
    },
    [commit]
  );

  const applyTelopPreset = useCallback(
    (clipId: string, presetId: string, keepExistingText = true) => {
      const preset = getTelopPreset(presetId);
      if (!preset) return;
      commit((s) => ({
        ...s,
        textClips: s.textClips.map((c) =>
          c.id === clipId
            ? {
                ...c,
                text: keepExistingText && c.text.trim() ? c.text : preset.sampleText,
                x: preset.x,
                y: preset.y,
                style: { ...preset.style },
              }
            : c
        ),
      }));
    },
    [commit]
  );

  const addTelopFromPreset = useCallback(
    (presetId: string, trackId?: string) => {
      const preset = getTelopPreset(presetId);
      if (!preset) return;
      commit((s) => {
        const track =
          (trackId ? s.tracks.find((t) => t.id === trackId) : undefined) ??
          s.tracks.find((t) => t.kind === "text" && !t.locked);
        if (!track) return s;
        const desired = snapTime(s.playhead, SNAP_GRID_SEC, s.snapEnabled);
        const start = findFreeStart(
          s.textClips,
          [{ trackId: track.id, duration: preset.duration }],
          desired
        );
        const textClip = createTextClip({
          trackId: track.id,
          start,
          duration: preset.duration,
          text: preset.sampleText,
          x: preset.x,
          y: preset.y,
          style: { ...preset.style },
        });
        return { ...s, textClips: [...s.textClips, textClip], selectedClipId: textClip.id };
      });
    },
    [commit]
  );

  const duplicateSelected = useCallback(() => {
    if (state.selectedClipId) duplicateClip(state.selectedClipId);
  }, [state.selectedClipId, duplicateClip]);

  const addTextClip = useCallback(
    (trackId?: string) => {
      commit((s) => {
        const track =
          (trackId ? s.tracks.find((t) => t.id === trackId && !t.locked) : undefined) ??
          s.tracks.find((t) => t.kind === "text" && !t.locked);
        if (!track) return s;
        const desired = snapTime(s.playhead, SNAP_GRID_SEC, s.snapEnabled);
        const start = findFreeStart(s.textClips, [{ trackId: track.id, duration: 4 }], desired);
        const textClip = createTextClip({ trackId: track.id, start });
        return {
          ...s,
          textClips: [...s.textClips, textClip],
          selectedClipId: textClip.id,
          selectedTrackId: track.id,
        };
      });
    },
    [commit]
  );

  const loadState = useCallback((next: EditorState) => {
    histRef.current = createHistory();
    gestureActive.current = false;
    setSnapGuideTime(null);
    setState(next);
  }, []);

  const copySelectedClip = useCallback(() => {
    const id = state.selectedClipId;
    if (!id) return false;
    const text = state.textClips.find((c) => c.id === id);
    if (text) {
      clipClipboardRef.current = { clips: [], textClips: [structuredClone(text)] };
      return true;
    }
    const ids = new Set(withLinked(state, id));
    const clips = state.clips.filter((c) => ids.has(c.id)).map((c) => structuredClone(c));
    if (!clips.length) return false;
    clipClipboardRef.current = { clips, textClips: [] };
    return true;
  }, [state]);

  const pasteClipboard = useCallback(() => {
    const buf = clipClipboardRef.current;
    if (!buf) return false;
    commit((s) => {
      const at = snapTime(s.playhead, SNAP_GRID_SEC, s.snapEnabled);
      if (buf.textClips.length) {
        const src = buf.textClips[0]!;
        const start = findFreeStart(s.textClips, [{ trackId: src.trackId, duration: src.duration }], at);
        const copy: TextClip = {
          ...structuredClone(src),
          id: uid(),
          start,
          style: structuredClone(src.style),
        };
        return { ...s, textClips: [...s.textClips, copy], selectedClipId: copy.id };
      }
      const idMap = new Map<string, string>();
      for (const c of buf.clips) idMap.set(c.id, uid());
      const base = buf.clips[0]!.start;
      let shift = at;
      for (let guard = 0; guard < 200; guard++) {
        let nextShift: number | null = null;
        for (const c of buf.clips) {
          const rel = c.start - base;
          const start = shift + rel;
          const hit = s.clips.find(
            (o) => o.trackId === c.trackId && start < clipTimelineEnd(o) && start + c.duration > o.start
          );
          if (hit) {
            nextShift = clipTimelineEnd(hit) - rel;
            break;
          }
        }
        if (nextShift == null) break;
        shift = nextShift;
      }
      const pasted = buf.clips.map((c) => ({
        ...structuredClone(c),
        id: idMap.get(c.id)!,
        start: shift + (c.start - base),
        linkedClipId: c.linkedClipId ? idMap.get(c.linkedClipId) : undefined,
      }));
      return {
        ...s,
        clips: [...s.clips, ...pasted],
        selectedClipId: pasted[0]?.id ?? s.selectedClipId,
      };
    });
    return true;
  }, [commit]);

  return {
    state,
    snapGuideTime,
    canUndo: histRef.current.past.length > 0,
    canRedo: histRef.current.future.length > 0,
    patch,
    commit,
    beginGesture,
    endGesture,
    undo: undoAction,
    redo: redoAction,
    importFiles,
    removeAsset,
    importDaw,
    importPPhoto,
    importAudioOntoTrack,
    importImageOntoOverlay,
    importCaptions,
    exportCaptionsSrt,
    fitClipToProject,
    addClipFromAsset,
    addTextClip,
    moveClip,
    trimClip,
    trimClipTo,
    trimToPlayhead,
    splitAtPlayhead,
    deleteClip,
    closeGaps,
    duplicateClip,
    duplicateSelected,
    updateClip,
    updateTransform,
    resetTransform,
    resetEffects,
    toggleClipAudio,
    detachLinkedAudio,
    updateEffects,
    setTransition,
    addTrack,
    removeTrack,
    toggleTrack,
    toggleSolo,
    setTrackVolume,
    updateTextStyle,
    applyTelopPreset,
    addTelopFromPreset,
    loadState,
    copySelectedClip,
    pasteClipboard,
  };
};

/** 重なりが発生した際、最も近い前後どちらかの空きエッジへ寄せる */
const resolveNearestNonOverlappingStart = (
  clips: TimelineClip[],
  trackId: string,
  desiredStart: number,
  duration: number,
  excludeIds: Set<string>
): number => {
  const forward = findFreeStart(clips, [{ trackId, duration }], Math.max(0, desiredStart), excludeIds);
  // 後ろ側だけでなく手前側の空きも探す
  const blockers = clipsOnTrack(clips, trackId).filter((c) => !excludeIds.has(c.id));
  let best = forward;
  let bestDist = Math.abs(forward - desiredStart);
  for (const b of blockers) {
    const before = b.start - duration;
    if (before >= 0 && canPlaceClip(clips, trackId, before, duration, excludeIds)) {
      const dist = Math.abs(before - desiredStart);
      if (dist < bestDist) {
        best = before;
        bestDist = dist;
      }
    }
  }
  return best;
};

/** 素材をタイムラインへスマート配置（指定位置が塞がっていても直後の空きへ自動で繋げる） */
const placeAssetIntoState = (
  s: EditorState,
  asset: MediaAsset,
  trackId?: string,
  at?: number
): { state: EditorState; result: { ok: boolean; reason?: string } } => {
  const track = trackId ? s.tracks.find((t) => t.id === trackId && !t.locked) : undefined;
  const desired = snapTime(at ?? s.playhead, SNAP_GRID_SEC, s.snapEnabled);

  if (asset.kind === "video") {
    const vTrack = track?.kind === "video" ? track : firstTrackOfKind(s, "video");
    const aTrack = firstTrackOfKind(s, "audio");
    if (!vTrack) return { state: s, result: { ok: false, reason: "ロックされていない映像トラックがありません" } };
    const duration = asset.duration || 1;
    const targets = [
      { trackId: vTrack.id, duration },
      ...(asset.hasAudio !== false && aTrack ? [{ trackId: aTrack.id, duration }] : []),
    ];
    const start = findFreeStart(s.clips, targets, desired);
    if (asset.hasAudio !== false && aTrack) {
      const pair = makeVideoWithLinkedAudio(asset, vTrack.id, aTrack.id, start);
      return {
        state: {
          ...s,
          clips: [...s.clips, ...pair],
          selectedClipId: pair[0]!.id,
          selectedTrackId: vTrack.id,
        },
        result: { ok: true },
      };
    }
    const clip = makeClip(asset, vTrack.id, start);
    return {
      state: {
        ...s,
        clips: [...s.clips, clip],
        selectedClipId: clip.id,
        selectedTrackId: vTrack.id,
      },
      result: { ok: true },
    };
  }

  if (asset.kind === "audio") {
    const aTrack = track?.kind === "audio" ? track : firstTrackOfKind(s, "audio");
    if (!aTrack) return { state: s, result: { ok: false, reason: "ロックされていない音声トラックがありません" } };
    const duration = asset.duration || 1;
    const start = findFreeStart(s.clips, [{ trackId: aTrack.id, duration }], desired);
    const clip = makeClip(asset, aTrack.id, start, { origin: "media" });
    return {
      state: {
        ...s,
        clips: [...s.clips, clip],
        selectedClipId: clip.id,
        selectedTrackId: aTrack.id,
      },
      result: { ok: true },
    };
  }

  const oTrack = track?.kind === "overlay" ? track : firstTrackOfKind(s, "overlay") ?? firstTrackOfKind(s, "video");
  if (!oTrack) return { state: s, result: { ok: false, reason: "ロックされていないオーバーレイトラックがありません" } };
  const start = findFreeStart(s.clips, [{ trackId: oTrack.id, duration: 5 }], desired);
  const clip = makeClip(asset, oTrack.id, start);
  return {
    state: {
      ...s,
      clips: [...s.clips, clip],
      selectedClipId: clip.id,
      selectedTrackId: oTrack.id,
    },
    result: { ok: true },
  };
};

export type EditorApi = ReturnType<typeof useEditor>;
