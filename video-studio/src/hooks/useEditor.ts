import { useCallback, useRef, useState } from "react";
import { getLinkedClip } from "../audio/clipAudio";
import { createHistory, pushHistory, redo, undo, type HistoryStack } from "../history";
import { parseDawProject } from "../daw/import";
import { fileToAsset } from "../media/probe";
import type { ClipEffects, EditorState, MediaAsset, TextClip, TimelineClip, TrackKind } from "../types";
import { SNAP_GRID_SEC, clipTimelineEnd, initialEditorState, projectDuration } from "../types";
import { createTextClip } from "../text/createTextClip";
import { getTelopPreset } from "../text/telopPresets";
import { mergeTextStyle, type TextStyle } from "../text/textStyle";
import { makeClip, makeVideoWithLinkedAudio } from "../utils/clipFactory";
import { snapTime } from "../utils/time";
import { canPlaceClip } from "../utils/timeline";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const withLinked = (s: EditorState, clipId: string): string[] => {
  const clip = s.clips.find((c) => c.id === clipId);
  if (!clip?.linkedClipId) return [clipId];
  return [clipId, clip.linkedClipId];
};

const firstTrackOfKind = (s: EditorState, kind: TrackKind) =>
  s.tracks.find((t) => t.kind === kind && !t.locked);

export const useEditor = () => {
  const [state, setState] = useState<EditorState>(initialEditorState);
  const histRef = useRef<HistoryStack>(createHistory());

  const commit = useCallback((updater: (s: EditorState) => EditorState) => {
    setState((prev) => {
      histRef.current = pushHistory(histRef.current, prev);
      const next = updater(prev);
      return {
        ...next,
        duration: Math.max(next.duration, projectDuration(next.clips, next.textClips)),
      };
    });
  }, []);

  const patch = useCallback((partial: Partial<EditorState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const undoAction = useCallback(() => {
    const r = undo(histRef.current, state);
    if (r) {
      histRef.current = r.hist;
      setState(r.state);
    }
  }, [state]);

  const redoAction = useCallback(() => {
    const r = redo(histRef.current, state);
    if (r) {
      histRef.current = r.hist;
      setState(r.state);
    }
  }, [state]);

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      const newAssets: MediaAsset[] = [];
      for (const f of list) {
        try {
          newAssets.push(await fileToAsset(f));
        } catch {
          /* skip */
        }
      }
      if (!newAssets.length) return;
      commit((s) => ({ ...s, assets: [...s.assets, ...newAssets] }));
    },
    [commit]
  );

  const importDaw = useCallback(async (file: File) => {
    const text = await file.text();
    const json = JSON.parse(text) as Parameters<typeof parseDawProject>[0];
    const { assets, clips } = parseDawProject(json);
    commit((s) => ({
      ...s,
      assets: [...s.assets, ...assets],
      clips: [...s.clips, ...clips],
    }));
  }, [commit]);

  const addClipFromAsset = useCallback(
    (assetId: string, trackId?: string, at?: number) => {
      commit((s) => {
        const track = trackId ? s.tracks.find((t) => t.id === trackId) : undefined;
        if (track?.kind === "text") {
          const start = snapTime(at ?? s.playhead, SNAP_GRID_SEC, s.snapEnabled);
          const textClip = createTextClip({ trackId: track.id, start });
          return { ...s, textClips: [...s.textClips, textClip], selectedClipId: textClip.id };
        }

        const asset = s.assets.find((a) => a.id === assetId);
        if (!asset) return s;
        const start = snapTime(at ?? s.playhead, SNAP_GRID_SEC, s.snapEnabled);

        if (asset.kind === "video") {
          const vTrack = track?.kind === "video" ? track : firstTrackOfKind(s, "video");
          const aTrack = firstTrackOfKind(s, "audio");
          if (!vTrack) return s;
          const duration = asset.duration;
          if (!canPlaceClip(s.clips, vTrack.id, start, duration)) return s;

          if (asset.hasAudio !== false && aTrack) {
            const pair = makeVideoWithLinkedAudio(asset, vTrack.id, aTrack.id, start);
            return {
              ...s,
              clips: [...s.clips, ...pair],
              selectedClipId: pair[0].id,
              selectedTrackId: vTrack.id,
            };
          }
          const clip = makeClip(asset, vTrack.id, start);
          return {
            ...s,
            clips: [...s.clips, clip],
            selectedClipId: clip.id,
            selectedTrackId: vTrack.id,
          };
        }

        if (asset.kind === "audio") {
          const aTrack = track?.kind === "audio" ? track : firstTrackOfKind(s, "audio");
          if (!aTrack) return s;
          const clip = makeClip(asset, aTrack.id, start, { origin: "media" });
          if (!canPlaceClip(s.clips, aTrack.id, start, clip.duration)) return s;
          return {
            ...s,
            clips: [...s.clips, clip],
            selectedClipId: clip.id,
            selectedTrackId: aTrack.id,
          };
        }

        const oTrack = track?.kind === "overlay" ? track : firstTrackOfKind(s, "overlay");
        if (!oTrack) return s;
        const clip = makeClip(asset, oTrack.id, start);
        if (!canPlaceClip(s.clips, oTrack.id, start, clip.duration)) return s;
        return {
          ...s,
          clips: [...s.clips, clip],
          selectedClipId: clip.id,
          selectedTrackId: oTrack.id,
        };
      });
    },
    [commit]
  );

  const moveClip = useCallback(
    (clipId: string, newStart: number, newTrackId?: string) => {
      commit((s) => {
        const ids = withLinked(s, clipId);
        const primary = s.clips.find((c) => c.id === clipId);
        if (!primary) return s;
        const delta = snapTime(newStart, SNAP_GRID_SEC, s.snapEnabled) - primary.start;

        return {
          ...s,
          clips: s.clips.map((c) => {
            if (!ids.includes(c.id)) return c;
            if (c.id === clipId && newTrackId) {
              const track = s.tracks.find((t) => t.id === newTrackId);
              if (!track || track.kind !== s.tracks.find((t) => t.id === c.trackId)?.kind) {
                return { ...c, start: c.start + delta };
              }
              if (!canPlaceClip(s.clips, newTrackId, c.start + delta, c.duration, c.id)) return c;
              return { ...c, start: c.start + delta, trackId: newTrackId };
            }
            const nextStart = c.start + delta;
            if (!canPlaceClip(s.clips, c.trackId, nextStart, c.duration, c.id)) return c;
            return { ...c, start: nextStart };
          }),
        };
      });
    },
    [commit]
  );

  const trimClip = useCallback(
    (clipId: string, edge: "start" | "end", deltaSec: number) => {
      commit((s) => {
        const ids = withLinked(s, clipId);
        const patchOne = (c: TimelineClip): TimelineClip => {
          if (!ids.includes(c.id)) return c;
          if (edge === "start") {
            const ds = Math.min(deltaSec, c.duration - 0.1);
            return {
              ...c,
              start: c.start + ds,
              inPoint: c.inPoint + ds * c.speed,
              duration: c.duration - ds,
            };
          }
          return { ...c, duration: Math.max(0.1, c.duration + deltaSec) };
        };
        if (s.textClips.some((c) => c.id === clipId)) {
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

  const splitAtPlayhead = useCallback(() => {
    commit((s) => {
      const t = s.playhead;
      const target = [...s.clips, ...s.textClips].find(
        (c) => t > c.start && t < clipTimelineEnd(c)
      );
      if (!target) return s;
      const local = t - target.start;
      const rightId = uid();
      const linked = getLinkedClip(s, target.id);
      const rightLinkedId = linked ? uid() : undefined;

      const splitOne = (c: TimelineClip, newRightId: string, linkTo?: string): [TimelineClip, TimelineClip] => {
        const left = { ...c, duration: local, linkedClipId: linkTo ? c.linkedClipId : c.linkedClipId };
        const right: TimelineClip = {
          ...c,
          id: newRightId,
          start: t,
          duration: c.duration - local,
          inPoint: c.inPoint + local * c.speed,
          linkedClipId: linkTo,
        };
        if (left.linkedClipId && linkTo) left.linkedClipId = linkTo;
        return [left, right];
      };

      if (s.textClips.some((c) => c.id === target.id)) {
        const [left, right] = splitOne(target, rightId);
        const styleCopy = structuredClone((target as TextClip).style);
        return {
          ...s,
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
        const video = toSplit.find((c) => s.tracks.find((t) => t.id === c.trackId)?.kind === "video")!;
        const audio = toSplit.find((c) => s.tracks.find((t) => t.id === c.trackId)?.kind === "audio")!;
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

      return { ...s, clips: [...others, ...newClips] };
    });
  }, [commit]);

  const deleteClip = useCallback(
    (clipId: string) => {
      commit((s) => {
        const ids = new Set(withLinked(s, clipId));
        return {
          ...s,
          clips: s.clips.filter((c) => !ids.has(c.id)),
          textClips: s.textClips.filter((c) => c.id !== clipId),
          selectedClipId: ids.has(s.selectedClipId ?? "") ? null : s.selectedClipId,
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
          const copy: TextClip = {
            ...src,
            id: uid(),
            start: clipTimelineEnd(c),
            style: structuredClone(src.style),
          };
          return { ...s, textClips: [...s.textClips, copy] };
        }
        const src = c as TimelineClip;
        const copyId = uid();
        const copy: TimelineClip = {
          ...src,
          id: copyId,
          start: clipTimelineEnd(src),
          linkedClipId: undefined,
        };
        const linked = getLinkedClip(s, clipId);
        if (linked) {
          const copy2: TimelineClip = {
            ...linked,
            id: uid(),
            start: copy.start,
            linkedClipId: copyId,
          };
          copy.linkedClipId = copy2.id;
          return { ...s, clips: [...s.clips, copy, copy2] };
        }
        return { ...s, clips: [...s.clips, copy] };
      });
    },
    [commit]
  );

  const updateClip = useCallback(
    (clipId: string, patch: Partial<TimelineClip> | Partial<TextClip>) => {
      commit((s) => {
        const ids = withLinked(s, clipId);
        const syncKeys = ["start", "duration", "inPoint", "speed"] as const;
        const shouldSync = syncKeys.some((k) => k in patch);

        if (s.textClips.some((c) => c.id === clipId)) {
          return {
            ...s,
            textClips: s.textClips.map((c) =>
              c.id === clipId ? { ...c, ...patch } : c
            ),
          };
        }
        return {
          ...s,
          clips: s.clips.map((c) => {
            if (c.id === clipId) return { ...c, ...patch };
            if (shouldSync && ids.includes(c.id) && c.id !== clipId) {
              const synced: Partial<TimelineClip> = {};
              for (const k of syncKeys) {
                if (k in patch) synced[k] = patch[k] as never;
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
        const id = `${kind[0]}${n}-${uid()}`;
        return {
          ...s,
          tracks: [
            ...s.tracks,
            {
              id,
              name: `${kind} ${n}`,
              kind,
              color: colors[kind],
              height: kind === "video" ? 80 : kind === "audio" ? 64 : 40,
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
    (clipId: string, presetId: string) => {
      const preset = getTelopPreset(presetId);
      if (!preset) return;
      commit((s) => ({
        ...s,
        textClips: s.textClips.map((c) =>
          c.id === clipId
            ? {
                ...c,
                text: preset.sampleText,
                x: preset.x,
                y: preset.y,
                duration: preset.duration,
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
        const start = snapTime(s.playhead, SNAP_GRID_SEC, s.snapEnabled);
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

  const loadState = useCallback((next: EditorState) => {
    histRef.current = createHistory();
    setState(next);
  }, []);

  return {
    state,
    patch,
    commit,
    undo: undoAction,
    redo: redoAction,
    importFiles,
    importDaw,
    addClipFromAsset,
    moveClip,
    trimClip,
    splitAtPlayhead,
    deleteClip,
    duplicateClip,
    updateClip,
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
  };
};

export type EditorApi = ReturnType<typeof useEditor>;
