import {
  AlignCenter,
  FlipHorizontal2,
  Link2Off,
  RotateCcw,
  RotateCw,
  Volume2,
} from "lucide-react";
import { getClipOrigin, getLinkedClip, isVideoClip, originLabel } from "../audio/clipAudio";
import type { ExportFormat } from "../export/exportCapabilities";
import { exportFormatHint } from "../export/exportVideo";
import type { EditorApi } from "../hooks/useEditor";
import type { InspectorTab } from "../hooks/useUiPrefs";
import type { ClipEffects, EditorState, TextClip, TimelineClip } from "../types";
import { DEFAULT_FPS, defaultEffects, projectDuration, resolveTransform } from "../types";
import { formatTime } from "../utils/time";
import { TextTelopInspector } from "./TextTelopInspector";

const FX_LABELS: Record<keyof ClipEffects, { label: string; unit: string; max: number }> = {
  brightness: { label: "明るさ", unit: "%", max: 200 },
  contrast: { label: "コントラスト", unit: "%", max: 200 },
  saturation: { label: "彩度", unit: "%", max: 200 },
  blur: { label: "ぼかし", unit: "px", max: 24 },
  grayscale: { label: "モノクロ", unit: "%", max: 100 },
  sepia: { label: "セピア", unit: "%", max: 100 },
};

const FX_PRESETS: { name: string; fx: ClipEffects }[] = [
  { name: "標準", fx: defaultEffects() },
  {
    name: "シネマ",
    fx: { brightness: 98, contrast: 118, saturation: 88, blur: 0, grayscale: 0, sepia: 8 },
  },
  {
    name: "鮮やか",
    fx: { brightness: 104, contrast: 112, saturation: 138, blur: 0, grayscale: 0, sepia: 0 },
  },
  {
    name: "ウォーム",
    fx: { brightness: 104, contrast: 104, saturation: 112, blur: 0, grayscale: 0, sepia: 22 },
  },
  {
    name: "モノクロ",
    fx: { brightness: 102, contrast: 120, saturation: 100, blur: 0, grayscale: 100, sepia: 0 },
  },
  {
    name: "背景ぼかし",
    fx: { brightness: 90, contrast: 100, saturation: 95, blur: 10, grayscale: 0, sepia: 0 },
  },
];

interface Props {
  state: EditorState;
  editor: EditorApi;
  tab: InspectorTab;
  onTab: (t: InspectorTab) => void;
  exportFormat: ExportFormat;
  onExportFormat: (f: ExportFormat) => void;
}

const findSelected = (state: EditorState): TimelineClip | TextClip | null => {
  const id = state.selectedClipId;
  if (!id) return null;
  return state.textClips.find((c) => c.id === id) ?? state.clips.find((c) => c.id === id) ?? null;
};

export const InspectorPanel = ({
  state,
  editor,
  tab,
  onTab,
  exportFormat,
  onExportFormat,
}: Props) => {
  const clip = findSelected(state);
  const isText = Boolean(clip && state.textClips.some((t) => t.id === clip.id));
  const textClip = isText ? (clip as TextClip) : null;
  const mediaClip = clip && !isText ? (clip as TimelineClip) : null;
  const track = clip ? state.tracks.find((tr) => tr.id === clip.trackId) : undefined;
  const isVisualMedia = Boolean(
    mediaClip && track && (track.kind === "video" || track.kind === "overlay")
  );
  const linked = mediaClip ? getLinkedClip(state, mediaClip.id) : null;
  const onVideo = Boolean(mediaClip && isVideoClip(state, mediaClip));
  const origin = mediaClip ? getClipOrigin(mediaClip) : null;
  const audioTracks = state.tracks.filter((t) => t.kind === "audio");
  const anySolo = audioTracks.some((t) => t.solo);

  const tabs: { id: InspectorTab; label: string; show: boolean }[] = [
    { id: "telop", label: "テロップ", show: Boolean(textClip) },
    { id: "basic", label: "クリップ", show: true },
    { id: "fx", label: "色・FX", show: isVisualMedia },
    { id: "audio", label: "ミキサー", show: true },
    { id: "project", label: "設定", show: true },
  ];

  const activeTab = tabs.find((t) => t.id === tab && t.show) ? tab : textClip ? "telop" : "basic";
  const tr = mediaClip ? resolveTransform(mediaClip) : null;

  return (
    <aside className="inspector">
      <div className="inspector__tabs" role="tablist">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              className={`inspector__tab ${activeTab === t.id ? "inspector__tab--active" : ""}`}
              onClick={() => onTab(t.id)}
            >
              {t.label}
            </button>
          ))}
      </div>

      <div className="inspector__body">
        {/* 未選択時のガイド */}
        {!clip && activeTab === "basic" && (
          <div className="inspector__empty">
            <p>
              タイムライン上の<strong>クリップ</strong>またはプレビュー画面上の<strong>映像・テロップ</strong>をクリックすると、位置・拡大率・音量・フェードなどを細かく調整できます。
            </p>
            <div className="inspector__summary">
              <div>
                <span>作品の長さ</span>
                <strong>{formatTime(projectDuration(state.clips, state.textClips))}</strong>
              </div>
              <div>
                <span>解像度 / FPS</span>
                <strong>
                  {state.previewWidth}×{state.previewHeight} / {state.fps ?? DEFAULT_FPS}fps
                </strong>
              </div>
              <div>
                <span>クリップ数</span>
                <strong>{state.clips.length + state.textClips.length} 個</strong>
              </div>
            </div>
          </div>
        )}

        {/* テロップ専用タブ */}
        {textClip && activeTab === "telop" && (
          <TextTelopInspector clip={textClip} editor={editor} />
        )}

        {/* クリップ基本（変形・時間・フェード・速度・音声） */}
        {clip && activeTab === "basic" && (
          <>
            <section className="inspector__section">
              <h3 className="inspector__section-title">タイミング</h3>
              <div className="telop-inspector__row2">
                <label className="field">
                  <span className="field__label">開始 (秒)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.05}
                    value={Number(clip.start.toFixed(2))}
                    onChange={(e) =>
                      editor.moveClip(clip.id, Math.max(0, Number(e.target.value)), undefined, true)
                    }
                  />
                </label>
                <label className="field">
                  <span className="field__label">表示長 (秒)</span>
                  <input
                    type="number"
                    min={0.1}
                    step={0.05}
                    value={Number(clip.duration.toFixed(2))}
                    onChange={(e) =>
                      editor.trimClipTo(
                        clip.id,
                        "end",
                        clip.start + Math.max(0.1, Number(e.target.value)),
                        true
                      )
                    }
                  />
                </label>
              </div>
              {(isText ||
                (mediaClip &&
                  state.assets.find((a) => a.id === mediaClip.assetId)?.kind === "image")) && (
                <button
                  type="button"
                  className="btn btn--sm btn--block"
                  style={{ marginTop: 8 }}
                  onClick={() => editor.fitClipToProject(clip.id)}
                  title="0:00 から他の動画・音源の終わりまで一発で引き伸ばします（一枚絵MVや常時表示枠に便利）"
                >
                  作品全体の長さに合わせる (0:00〜終端)
                </button>
              )}
            </section>

            {/* 映像・画像の変形コントロール */}
            {mediaClip && isVisualMedia && tr && (
              <section className="inspector__section">
                <div className="inspector__section-head">
                  <h3 className="inspector__section-title">位置・サイズ・回転</h3>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => editor.resetTransform(mediaClip.id)}
                  >
                    <RotateCcw size={11} /> 初期化
                  </button>
                </div>

                <div className="inspector__row-btns">
                  <button
                    type="button"
                    className={`btn btn--sm ${tr.fit === "contain" ? "btn--primary" : ""}`}
                    onClick={() => editor.updateTransform(mediaClip.id, { fit: "contain" })}
                    title="見切れず枠内に収める"
                  >
                    全体表示 (Contain)
                  </button>
                  <button
                    type="button"
                    className={`btn btn--sm ${tr.fit === "cover" ? "btn--primary" : ""}`}
                    onClick={() => editor.updateTransform(mediaClip.id, { fit: "cover" })}
                    title="黒帯なしで画面いっぱいに埋める"
                  >
                    画面埋め (Cover)
                  </button>
                </div>

                <label className="field">
                  <span className="field__label">拡大率</span>
                  <div className="field__range-row">
                    <input
                      type="range"
                      min={0.1}
                      max={4}
                      step={0.02}
                      value={tr.scale}
                      onChange={(e) =>
                        editor.updateTransform(mediaClip.id, { scale: Number(e.target.value) })
                      }
                    />
                    <span>{Math.round(tr.scale * 100)}%</span>
                  </div>
                </label>

                <div className="telop-inspector__row2">
                  <label className="field">
                    <span className="field__label">横位置 X (%)</span>
                    <input
                      type="number"
                      step={1}
                      value={Math.round(tr.x * 100)}
                      onChange={(e) =>
                        editor.updateTransform(mediaClip.id, { x: Number(e.target.value) / 100 })
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">縦位置 Y (%)</span>
                    <input
                      type="number"
                      step={1}
                      value={Math.round(tr.y * 100)}
                      onChange={(e) =>
                        editor.updateTransform(mediaClip.id, { y: Number(e.target.value) / 100 })
                      }
                    />
                  </label>
                </div>

                <div className="inspector__row-btns">
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => editor.updateTransform(mediaClip.id, { x: 0.5, y: 0.5 })}
                  >
                    <AlignCenter size={12} /> 中央揃え
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() =>
                      editor.updateTransform(mediaClip.id, {
                        rotation: ((tr.rotation + 90 + 180) % 360) - 180,
                      })
                    }
                  >
                    <RotateCw size={12} /> 90°回転
                  </button>
                  <button
                    type="button"
                    className={`btn btn--sm ${tr.flipH ? "btn--primary" : ""}`}
                    onClick={() => editor.updateTransform(mediaClip.id, { flipH: !tr.flipH })}
                  >
                    <FlipHorizontal2 size={12} /> 左右反転
                  </button>
                </div>

                <label className="field">
                  <span className="field__label">回転角度</span>
                  <div className="field__range-row">
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      step={1}
                      value={tr.rotation}
                      onChange={(e) =>
                        editor.updateTransform(mediaClip.id, { rotation: Number(e.target.value) })
                      }
                    />
                    <span>{Math.round(tr.rotation)}°</span>
                  </div>
                </label>

                <label className="field">
                  <span className="field__label">不透明度</span>
                  <div className="field__range-row">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={mediaClip.opacity}
                      onChange={(e) =>
                        editor.updateClip(mediaClip.id, { opacity: Number(e.target.value) })
                      }
                    />
                    <span>{mediaClip.opacity}%</span>
                  </div>
                </label>
              </section>
            )}

            {/* フェード & クロスフェード */}
            {mediaClip && (
              <section className="inspector__section">
                <h3 className="inspector__section-title">フェード・切り替え</h3>
                <label className="field">
                  <span className="field__label">フェードイン</span>
                  <div className="field__range-row">
                    <input
                      type="range"
                      min={0}
                      max={Math.min(5, Number((mediaClip.duration / 2).toFixed(2)))}
                      step={0.05}
                      value={mediaClip.fadeIn ?? 0}
                      onChange={(e) =>
                        editor.updateClip(mediaClip.id, { fadeIn: Number(e.target.value) })
                      }
                    />
                    <span>{(mediaClip.fadeIn ?? 0).toFixed(2)}s</span>
                  </div>
                </label>
                <label className="field">
                  <span className="field__label">フェードアウト</span>
                  <div className="field__range-row">
                    <input
                      type="range"
                      min={0}
                      max={Math.min(5, Number((mediaClip.duration / 2).toFixed(2)))}
                      step={0.05}
                      value={mediaClip.fadeOut ?? 0}
                      onChange={(e) =>
                        editor.updateClip(mediaClip.id, { fadeOut: Number(e.target.value) })
                      }
                    />
                    <span>{(mediaClip.fadeOut ?? 0).toFixed(2)}s</span>
                  </div>
                </label>

                <div className="inspector__row-btns">
                  <button
                    type="button"
                    className={`btn btn--sm ${mediaClip.transitionOut?.kind === "crossfade" ? "btn--primary" : ""}`}
                    onClick={() =>
                      editor.setTransition(
                        mediaClip.id,
                        mediaClip.transitionOut?.kind === "crossfade" ? "none" : "crossfade",
                        0.5
                      )
                    }
                  >
                    次クリップとクロスフェード
                  </button>
                </div>
                {mediaClip.transitionOut?.kind === "crossfade" && (
                  <label className="field">
                    <span className="field__label">クロスフェード長</span>
                    <div className="field__range-row">
                      <input
                        type="range"
                        min={0.1}
                        max={2.5}
                        step={0.05}
                        value={mediaClip.transitionOut.duration}
                        onChange={(e) =>
                          editor.setTransition(mediaClip.id, "crossfade", Number(e.target.value))
                        }
                      />
                      <span>{mediaClip.transitionOut.duration.toFixed(2)}s</span>
                    </div>
                  </label>
                )}
              </section>
            )}

            {/* 速度 */}
            {mediaClip && track?.kind !== "overlay" && (
              <section className="inspector__section">
                <h3 className="inspector__section-title">再生速度</h3>
                <div className="speed-pills">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      className={`filter-pill ${mediaClip.speed === sp ? "filter-pill--active" : ""}`}
                      onClick={() => editor.updateClip(mediaClip.id, { speed: sp })}
                    >
                      {sp}×
                    </button>
                  ))}
                </div>
                <div className="field__range-row">
                  <input
                    type="range"
                    min={0.25}
                    max={4}
                    step={0.05}
                    value={mediaClip.speed}
                    onChange={(e) =>
                      editor.updateClip(mediaClip.id, { speed: Number(e.target.value) })
                    }
                  />
                  <span>{mediaClip.speed.toFixed(2)}×</span>
                </div>
              </section>
            )}

            {/* 音声セクション */}
            {mediaClip && origin && track?.kind !== "overlay" && (
              <section className="inspector__section inspector__audio">
                <div className="inspector__section-head">
                  <h3 className="inspector__section-title">クリップ音声</h3>
                  <span className={`pill pill--${origin === "daw" ? "daw" : "linked"}`}>
                    {originLabel[origin]}
                  </span>
                </div>

                <label className="field field--row">
                  <input
                    type="checkbox"
                    checked={!(linked?.audioMuted ?? mediaClip.audioMuted)}
                    onChange={() => editor.toggleClipAudio(linked?.id ?? mediaClip.id)}
                  />
                  <span>このクリップの音声を鳴らす</span>
                </label>

                <label className="field">
                  <span className="field__label">音量ゲイン</span>
                  <div className="field__range-row">
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.05}
                      value={(linked ?? mediaClip).volume}
                      onChange={(e) =>
                        editor.updateClip((linked ?? mediaClip).id, {
                          volume: Number(e.target.value),
                        })
                      }
                    />
                    <span>{Math.round((linked ?? mediaClip).volume * 100)}%</span>
                  </div>
                </label>

                {linked && (
                  <div className="inspector__row-btns">
                    {onVideo && (
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() => editor.patch({ selectedClipId: linked.id })}
                      >
                        音声クリップを選択
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => editor.detachLinkedAudio(mediaClip.id)}
                    >
                      <Link2Off size={12} /> リンク解除
                    </button>
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {/* 色補正・エフェクトタブ */}
        {mediaClip && isVisualMedia && activeTab === "fx" && (
          <section className="inspector__section">
            <div className="inspector__section-head">
              <h3 className="inspector__section-title">ワンクリック色味プリセット</h3>
              <button
                type="button"
                className="btn-link"
                onClick={() => editor.resetEffects(mediaClip.id)}
              >
                <RotateCcw size={11} /> リセット
              </button>
            </div>
            <div className="fx-preset-grid">
              {FX_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className="btn btn--sm"
                  onClick={() => editor.updateEffects(mediaClip.id, p.fx)}
                >
                  {p.name}
                </button>
              ))}
            </div>

            {(Object.keys(FX_LABELS) as (keyof ClipEffects)[]).map((key) => {
              const cfg = FX_LABELS[key];
              const val = mediaClip.effects[key];
              return (
                <label key={key} className="field">
                  <span className="field__label">{cfg.label}</span>
                  <div className="field__range-row">
                    <input
                      type="range"
                      min={0}
                      max={cfg.max}
                      value={val}
                      onChange={(e) =>
                        editor.updateEffects(mediaClip.id, { [key]: Number(e.target.value) })
                      }
                    />
                    <span>
                      {val}
                      {cfg.unit}
                    </span>
                  </div>
                </label>
              );
            })}
          </section>
        )}

        {/* 音声ミキサータブ */}
        {activeTab === "audio" && (
          <section className="inspector__section">
            <h3 className="inspector__section-title">
              <Volume2 size={14} /> マスター音量
            </h3>
            <div className="field__range-row">
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.02}
                value={!state.audioEnabled ? 0 : state.masterVolume}
                onChange={(e) =>
                  editor.patch({ masterVolume: Number(e.target.value), audioEnabled: true })
                }
              />
              <span>{!state.audioEnabled ? "MUTE" : `${Math.round(state.masterVolume * 100)}%`}</span>
            </div>

            <h3 className="inspector__section-title" style={{ marginTop: 10 }}>
              トラック別ミキサー
            </h3>
            <div className="mixer-list">
              {audioTracks.map((trItem) => (
                <div key={trItem.id} className="mixer-card">
                  <div className="mixer-card__top">
                    <span className="mixer-card__name">{trItem.name}</span>
                    <div className="mixer-card__btns">
                      <button
                        type="button"
                        className={`mixer-btn ${trItem.solo ? "mixer-btn--solo" : ""}`}
                        onClick={() => editor.toggleSolo(trItem.id)}
                      >
                        S
                      </button>
                      <button
                        type="button"
                        className={`mixer-btn ${trItem.muted ? "mixer-btn--mute" : ""}`}
                        onClick={() => editor.toggleTrack(trItem.id, "muted")}
                        disabled={anySolo && !trItem.solo}
                      >
                        M
                      </button>
                    </div>
                  </div>
                  <div className="field__range-row">
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.05}
                      value={trItem.volume}
                      disabled={trItem.muted || (anySolo && !trItem.solo)}
                      onChange={(e) => editor.setTrackVolume(trItem.id, Number(e.target.value))}
                    />
                    <span>{Math.round(trItem.volume * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="inspector__note">
              プレビューのトラック音量・ソロ・ミュート・フェード設定は、そのまま書き出し音声に完全反映されます。
            </p>
          </section>
        )}

        {/* プロジェクト設定タブ */}
        {activeTab === "project" && (
          <section className="inspector__section">
            <label className="field">
              <span className="field__label">プロジェクト名</span>
              <input
                value={state.title}
                onChange={(e) => editor.patch({ title: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field__label">キャンバス解像度</span>
              <select
                value={`${state.previewWidth}x${state.previewHeight}`}
                onChange={(e) => {
                  const [w, h] = e.target.value.split("x").map(Number);
                  editor.patch({ previewWidth: w, previewHeight: h });
                }}
              >
                <option value="1920x1080">フルHD 横 16:9 (1920×1080)</option>
                <option value="1280x720">HD 横 16:9 (1280×720)</option>
                <option value="1080x1920">ショート縦 9:16 (1080×1920)</option>
                <option value="1080x1080">正方形 1:1 (1080×1080)</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">フレームレート (FPS)</span>
              <select
                value={state.fps ?? DEFAULT_FPS}
                onChange={(e) => editor.patch({ fps: Number(e.target.value) })}
              >
                <option value={24}>24 fps（映画調）</option>
                <option value={30}>30 fps（標準・YouTube推奨）</option>
                <option value={60}>60 fps（高フレームレート）</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">最小タイムライン余白長（秒）</span>
              <input
                type="number"
                min={5}
                value={state.duration}
                onChange={(e) => editor.patch({ duration: Math.max(5, Number(e.target.value)) })}
              />
              <span className="field__hint">
                ※書き出し時の動画長は最後のクリップ終端（現在{" "}
                {formatTime(projectDuration(state.clips, state.textClips))}）に自動で揃います。
              </span>
            </label>
            <label className="field">
              <span className="field__label">書き出し形式</span>
              <select
                value={exportFormat}
                onChange={(e) => onExportFormat(e.target.value as ExportFormat)}
              >
                <option value="mp4">MP4（H.264 + AAC・推奨）</option>
                <option value="webm">WebM（VP9 + Opus）</option>
              </select>
              <span className="field__hint">{exportFormatHint(exportFormat)}</span>
            </label>
          </section>
        )}
      </div>
    </aside>
  );
};
