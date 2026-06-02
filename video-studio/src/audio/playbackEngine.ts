import { collectAudibleClips } from "./clipAudio";
import type { EditorState, MediaAsset } from "../types";

interface MediaNode {
  element: HTMLMediaElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  assetId: string;
}

/**
 * プレビュー再生エンジン。
 * 動画トラックは Canvas（無音）、音声は Audio トラックのクリップから再生。
 * DAW 取り込み・動画リンク音声・単独音声ファイルを同じミキサーで扱う。
 */
export class PlaybackEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes = new Map<string, MediaNode>();

  private ensureCtx() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    return { ctx: this.ctx, master: this.master! };
  }

  private getElement(asset: MediaAsset): HTMLMediaElement {
    if (asset.kind === "video") {
      const v = document.createElement("video");
      v.src = asset.url;
      v.crossOrigin = "anonymous";
      v.playsInline = true;
      v.preload = "auto";
      return v;
    }
    const a = document.createElement("audio");
    a.src = asset.url;
    a.preload = "auto";
    return a;
  }

  dispose() {
    for (const n of this.nodes.values()) {
      n.source.disconnect();
      n.gain.disconnect();
      n.element.pause();
    }
    this.nodes.clear();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }

  sync(state: EditorState) {
    const { ctx, master } = this.ensureCtx();
    master.gain.value = state.audioEnabled ? state.masterVolume : 0;

    if (!state.isPlaying) {
      for (const n of this.nodes.values()) n.element.pause();
      return;
    }

    if (ctx.state === "suspended") void ctx.resume();

    const audible = collectAudibleClips(state, state.playhead);
    const activeKeys = new Set<string>();

    for (const { clip, asset, effectiveVolume } of audible) {
      const key = clip.id;
      activeKeys.add(key);
      let node = this.nodes.get(key);
      if (!node || node.assetId !== asset.id) {
        if (node) {
          node.source.disconnect();
          node.gain.disconnect();
          node.element.pause();
        }
        const element = this.getElement(asset);
        element.muted = false;
        const source = ctx.createMediaElementSource(element);
        const gain = ctx.createGain();
        source.connect(gain);
        gain.connect(master);
        node = { element, source, gain, assetId: asset.id };
        this.nodes.set(key, node);
      }

      const local = state.playhead - clip.start;
      const sourceT = clip.inPoint + local * clip.speed;
      const el = node.element;
      if (Math.abs(el.currentTime - sourceT) > 0.08) {
        el.currentTime = sourceT;
      }
      el.playbackRate = clip.speed;
      node.gain.gain.value = effectiveVolume;
      if (el.paused) void el.play().catch(() => {});
    }

    for (const [key, node] of this.nodes) {
      if (!activeKeys.has(key)) {
        node.element.pause();
      }
    }
  }

  /** スクラブ時に一瞬だけ聴く */
  scrubPreview(state: EditorState, time: number) {
    const { ctx, master } = this.ensureCtx();
    master.gain.value = state.masterVolume * 0.5;
    const audible = collectAudibleClips(state, time);
    for (const { clip, asset, effectiveVolume } of audible.slice(0, 1)) {
      const key = `scrub-${clip.id}`;
      let node = this.nodes.get(key);
      if (!node) {
        const element = this.getElement(asset);
        const source = ctx.createMediaElementSource(element);
        const gain = ctx.createGain();
        source.connect(gain);
        gain.connect(master);
        node = { element, source, gain, assetId: asset.id };
        this.nodes.set(key, node);
      }
      const local = time - clip.start;
      node.element.currentTime = clip.inPoint + local * clip.speed;
      node.gain.gain.value = effectiveVolume;
      void node.element.play().catch(() => {});
      setTimeout(() => node.element.pause(), 120);
    }
  }

  stopAll() {
    for (const n of this.nodes.values()) n.element.pause();
  }
}

export const playbackEngine = new PlaybackEngine();
