import type {
  EditorState,
  MediaAsset,
  ProjectFile,
  SerializedAsset,
  SerializedClip,
  TextClip,
  TimelineClip,
} from "./types";
import { PROJECT_VERSION, defaultEffects, projectDuration } from "./types";
import { textStyleFromLegacy } from "./text/textStyle";

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result as string;
      resolve(s.split(",")[1] ?? "");
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

const base64ToBlob = (data: string, mime: string) => {
  const bin = atob(data);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

const mimeForKind = (kind: MediaAsset["kind"]) => {
  if (kind === "video") return "video/mp4";
  if (kind === "audio") return "audio/wav";
  return "image/png";
};

export const serializeProject = async (state: EditorState): Promise<ProjectFile> => {
  const serializedAssets: SerializedAsset[] = [];

  for (const asset of state.assets) {
    const res = await fetch(asset.url);
    const blob = await res.blob();
    serializedAssets.push({
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      duration: asset.duration,
      width: asset.width,
      height: asset.height,
      hasAudio: asset.hasAudio,
      data: await blobToBase64(blob),
    });
  }

  const clips: SerializedClip[] = [
    ...state.clips.map((c) => ({ ...c, text: undefined })),
    ...state.textClips.map((t) => ({
      id: t.id,
      assetId: t.assetId,
      trackId: t.trackId,
      start: t.start,
      duration: t.duration,
      inPoint: t.inPoint,
      speed: t.speed,
      volume: t.volume,
      opacity: t.opacity,
      effects: t.effects,
      transitionOut: t.transitionOut,
      opacityKeyframes: t.opacityKeyframes,
      text: t.text,
      x: t.x,
      y: t.y,
      style: t.style,
    })),
  ];

  return {
    version: PROJECT_VERSION,
    title: state.title,
    assets: serializedAssets,
    tracks: state.tracks.map(({ clips: _c, ...t }) => t),
    clips,
    duration: state.duration,
    previewWidth: state.previewWidth,
    previewHeight: state.previewHeight,
    pxPerSec: state.pxPerSec,
    masterVolume: state.masterVolume,
    audioEnabled: state.audioEnabled,
  };
};

export const deserializeProject = (file: ProjectFile): EditorState => {
  const assets: MediaAsset[] = file.assets.map((a) => {
    const blob = base64ToBlob(a.data, mimeForKind(a.kind));
    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      url: URL.createObjectURL(blob),
      duration: a.duration,
      width: a.width,
      height: a.height,
      hasAudio: a.hasAudio,
    };
  });

  const clips: TimelineClip[] = [];
  const textClips: TextClip[] = [];

  for (const c of file.clips) {
    if (c.text != null) {
      textClips.push({
        ...c,
        assetId: c.assetId || "text-placeholder",
        audioMuted: true,
        effects: c.effects ?? defaultEffects(),
        opacityKeyframes: c.opacityKeyframes ?? [],
        text: c.text,
        x: c.x ?? 0.5,
        y: c.y ?? 0.5,
        style: textStyleFromLegacy({
          style: c.style,
          fontSize: c.fontSize,
          color: c.color,
          fontFamily: c.fontFamily,
        }),
      });
    } else {
      clips.push({
        ...c,
        audioMuted: c.audioMuted ?? false,
        origin: c.origin ?? "media",
        effects: c.effects ?? defaultEffects(),
        opacityKeyframes: c.opacityKeyframes ?? [],
      });
    }
  }

  const duration = Math.max(file.duration, projectDuration(clips, textClips));

  return {
    title: file.title,
    assets,
    tracks: file.tracks.map((t) => ({
      ...t,
      clips: [],
      solo: t.solo ?? false,
      volume: t.volume ?? 1,
    })),
    clips,
    textClips,
    duration,
    pxPerSec: file.pxPerSec,
    playhead: 0,
    isPlaying: false,
    loopA: null,
    loopB: null,
    snapEnabled: true,
    selectedClipId: null,
    selectedTrackId: null,
    previewWidth: file.previewWidth,
    previewHeight: file.previewHeight,
    masterVolume: file.masterVolume ?? 1,
    audioEnabled: file.audioEnabled ?? true,
  };
};

export const downloadProject = async (state: EditorState) => {
  const file = await serializeProject(state);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${state.title || "project"}.vproj`;
  a.click();
  URL.revokeObjectURL(a.href);
};
