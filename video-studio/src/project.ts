import type {
  EditorState,
  MediaAsset,
  ProjectFile,
  SerializedAsset,
  SerializedClip,
  TextClip,
  TimelineClip,
} from "./types";
import { DEFAULT_FPS, PROJECT_VERSION, defaultEffects, defaultTransform, projectDuration } from "./types";
import { textStyleFromLegacy } from "./text/textStyle";
import { downloadBlob } from "./export/exportVideo";

const blobToBase64 = (blob: Blob): Promise<{ base64: string; mime: string }> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result as string;
      const comma = s.indexOf(",");
      const header = comma >= 0 ? s.slice(0, comma) : "";
      const m = /^data:([^;]+);base64$/.exec(header);
      resolve({
        base64: comma >= 0 ? s.slice(comma + 1) : s,
        mime: m?.[1] || blob.type || "",
      });
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

const fallbackMimeForKind = (kind: MediaAsset["kind"]) => {
  if (kind === "video") return "video/mp4";
  if (kind === "audio") return "audio/wav";
  return "image/png";
};

export const serializeProject = async (state: EditorState): Promise<ProjectFile> => {
  const serializedAssets: SerializedAsset[] = [];

  for (const asset of state.assets) {
    const res = await fetch(asset.url);
    const blob = await res.blob();
    const { base64, mime } = await blobToBase64(blob);
    serializedAssets.push({
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      mimeType: asset.mimeType || mime || fallbackMimeForKind(asset.kind),
      duration: asset.duration,
      width: asset.width,
      height: asset.height,
      hasAudio: asset.hasAudio,
      data: base64,
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
      transform: t.transform,
      fadeIn: t.fadeIn,
      fadeOut: t.fadeOut,
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
    duration: projectDuration(state.clips, state.textClips),
    previewWidth: state.previewWidth,
    previewHeight: state.previewHeight,
    fps: state.fps ?? DEFAULT_FPS,
    pxPerSec: state.pxPerSec,
    masterVolume: state.masterVolume,
    audioEnabled: state.audioEnabled,
  };
};

export const deserializeProject = (file: ProjectFile): EditorState => {
  const assets: MediaAsset[] = file.assets.map((a) => {
    const mime = a.mimeType || fallbackMimeForKind(a.kind);
    const blob = base64ToBlob(a.data, mime);
    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      mimeType: mime,
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
        fadeIn: c.fadeIn ?? 0,
        fadeOut: c.fadeOut ?? 0,
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
        transform: c.transform ? { ...defaultTransform(), ...c.transform } : defaultTransform(),
        fadeIn: c.fadeIn ?? 0,
        fadeOut: c.fadeOut ?? 0,
        opacityKeyframes: c.opacityKeyframes ?? [],
      });
    }
  }

  const duration = projectDuration(clips, textClips);

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
    rippleMode: false,
    selectedClipId: null,
    selectedTrackId: null,
    previewWidth: file.previewWidth,
    previewHeight: file.previewHeight,
    fps: file.fps ?? DEFAULT_FPS,
    masterVolume: file.masterVolume ?? 1,
    audioEnabled: file.audioEnabled ?? true,
  };
};

export const downloadProject = async (state: EditorState) => {
  const file = await serializeProject(state);
  const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
  downloadBlob(blob, `${state.title || "project"}.vproj`);
};
