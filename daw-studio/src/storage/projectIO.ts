import {
  PROJECT_VERSION,
  makeClip,
  trackFxDefaults,
  type Clip,
  type ProjectClip,
  type ProjectFile,
  type Track,
} from "../types";

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

export const serializeProject = async (
  tracks: Track[],
  bpm: number,
  masterVolume: number,
  globalTime: number,
  pitchLimit: number
): Promise<ProjectFile> => {
  const projectTracks = await Promise.all(
    tracks.map(async (track) => {
      const clips = await Promise.all(
        track.clips.map(async (c) => {
          const blob = await (await fetch(c.url)).blob();
          const clipData: ProjectClip = { ...c, audioData: await toDataUrl(blob) };
          if (c.originalUrl) {
            const ob = await (await fetch(c.originalUrl)).blob();
            clipData.originalAudioData = await toDataUrl(ob);
          }
          return clipData;
        })
      );
      return { ...track, clips };
    })
  );
  return {
    version: PROJECT_VERSION,
    tracks: projectTracks,
    bpm,
    masterVolume,
    globalTime,
    pitchLimit,
  };
};

export const deserializeProject = async (parsed: ProjectFile): Promise<{
  tracks: Track[];
  bpm: number;
  masterVolume: number;
  globalTime: number;
  pitchLimit: number;
}> => {
  const restored = await Promise.all(
    parsed.tracks.map(async (td) => {
      let clips: Clip[];
      if (Array.isArray(td.clips)) {
        clips = await Promise.all(
          td.clips.map(async (pc) => {
            const blob = await (await fetch(pc.audioData!)).blob();
            const clip = makeClip({
              id: pc.id,
              url: URL.createObjectURL(blob),
              offset: pc.offset ?? 0,
              duration: pc.duration ?? 0,
            });
            if (pc.notes) clip.notes = pc.notes;
            if (pc.originalAudioData) {
              const ob = await (await fetch(pc.originalAudioData)).blob();
              clip.originalUrl = URL.createObjectURL(ob);
            }
            if (pc.muted) clip.muted = true;
            return clip;
          })
        );
      } else {
        const blob = await (await fetch(td.audioData!)).blob();
        clips = [
          makeClip({
            url: URL.createObjectURL(blob),
            offset: td.offset ?? 0,
            duration: td.duration ?? 0,
          }),
        ];
      }
      const { audioData: _a, url: _u, offset: _o, duration: _d, clips: _c, ...rest } = td;
      return {
        ...trackFxDefaults(),
        ...rest,
        clips,
        kind: rest.kind ?? "vocal",
        pitch: rest.pitch ?? 0,
        nudgeMs: rest.nudgeMs ?? 0,
        deEss: rest.deEss ?? 0,
        isMuted: rest.isMuted ?? false,
      } as Track;
    })
  );
  return {
    tracks: restored,
    bpm: parsed.bpm ?? 120,
    masterVolume: parsed.masterVolume ?? 1,
    globalTime: parsed.globalTime ?? 0,
    pitchLimit: parsed.pitchLimit ?? 2,
  };
};
