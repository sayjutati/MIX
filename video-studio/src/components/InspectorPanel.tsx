import { getClipOrigin, getLinkedClip, isVideoClip, originLabel } from "../audio/clipAudio";
import type { ExportFormat } from "../export/exportCapabilities";
import { exportFormatHint } from "../export/exportVideo";
import type { InspectorTab } from "../hooks/useUiPrefs";
import type { EditorApi } from "../hooks/useEditor";
import type { EditorState, TextClip, TimelineClip } from "../types";

const FX_LABELS: Record<string, string> = {
  brightness: "明るさ",
  contrast: "コントラスト",
  saturation: "彩度",
  blur: "ぼかし",
  grayscale: "モノクロ",
  sepia: "セピア",
};

interface Props {
  state: EditorState;
  editor: EditorApi;
  tab: InspectorTab;
  onTab: (t: InspectorTab) => void;
  isPro: boolean;
  exportFormat: ExportFormat;
  onExportFormat: (f: ExportFormat) => void;
}

const selectedClip = (state: EditorState): TimelineClip | TextClip | null => {
  const id = state.selectedClipId;
  if (!id) return null;
  return state.textClips.find((c) => c.id === id) ?? state.clips.find((c) => c.id === id) ?? null;
};

export const InspectorPanel = ({
  state,
  editor,
  tab,
  onTab,
  isPro,
  exportFormat,
  onExportFormat,
}: Props) => {
  const clip = selectedClip(state);
  const isText = clip && state.textClips.some((t) => t.id === clip.id);
  const textClip = isText ? (clip as TextClip) : null;
  const linked = clip && !isText ? getLinkedClip(state, clip.id) : null;
  const onVideo = clip && !isText && isVideoClip(state, clip as TimelineClip);
  const origin = clip && !isText ? getClipOrigin(clip as TimelineClip) : null;
  const hasClip = !!clip;

  const tabs: { id: InspectorTab; label: string; show: boolean }[] = [
    { id: "basic", label: hasClip ? "クリップ" : "ようこそ", show: true },
    { id: "fx", label: "映像FX", show: hasClip && !isText },
    { id: "project", label: "プロジェクト", show: true },
  ];

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
              aria-selected={tab === t.id}
              className={`inspector__tab ${tab === t.id ? "inspector__tab--active" : ""}`}
              onClick={() => onTab(t.id)}
            >
              {t.label}
            </button>
          ))}
      </div>

      <div className="inspector__body">
        {!hasClip && tab !== "project" && (
          <p className="inspector__hint card">
            タイムラインのクリップをクリックすると、ここで音量やテキストを編集できます。
          </p>
        )}

        {tab === "project" && (
          <section className="inspector__section">
            <label className="field">
              <span className="field__label">プロジェクト名</span>
              <input
                value={state.title}
                onChange={(e) => editor.patch({ title: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field__label">タイムライン長（秒）</span>
              <input
                type="number"
                min={1}
                value={state.duration}
                onChange={(e) => editor.patch({ duration: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span className="field__label">書き出し解像度</span>
              <select
                value={`${state.previewWidth}x${state.previewHeight}`}
                onChange={(e) => {
                  const [w, h] = e.target.value.split("x").map(Number);
                  editor.patch({ previewWidth: w, previewHeight: h });
                }}
              >
                <option value="1920x1080">YouTube 横 (1920×1080)</option>
                <option value="1280x720">HD 横 (1280×720)</option>
                <option value="1080x1920">縦動画 (1080×1920)</option>
                <option value="1080x1080">正方形 (1080×1080)</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">書き出し形式</span>
              <select
                value={exportFormat}
                onChange={(e) => onExportFormat(e.target.value as ExportFormat)}
              >
                <option value="mp4">MP4（YouTube 推奨）</option>
                <option value="webm">WebM</option>
              </select>
              <span className="field__hint">{exportFormatHint(exportFormat)}</span>
            </label>
          </section>
        )}

        {hasClip && tab === "basic" && (
          <>
            {!isText && origin && (
              <section className="inspector__section card inspector__audio">
                <h3 className="inspector__section-title">音声</h3>
                <p className="inspector__origin">
                  <span className={`pill pill--${origin === "daw" ? "daw" : "linked"}`}>
                    {originLabel[origin]}
                  </span>
                </p>
                {origin === "daw" && (
                  <p className="inspector__note">DAW Studio のミックス。動画の元音とは別です。</p>
                )}
                {onVideo && linked && (
                  <p className="inspector__note">映像と音声はリンク同期されています。</p>
                )}
                <label className="field field--row">
                  <input
                    type="checkbox"
                    checked={!(linked?.audioMuted ?? clip.audioMuted)}
                    onChange={() => editor.toggleClipAudio(linked?.id ?? clip.id)}
                  />
                  <span>このクリップの音声を再生</span>
                </label>
                {isPro && linked && (
                  <div className="inspector__row-btns">
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => editor.patch({ selectedClipId: linked.id })}
                    >
                      リンク先へ
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => editor.detachLinkedAudio(clip.id)}
                    >
                      リンク解除
                    </button>
                  </div>
                )}
              </section>
            )}

            {textClip && (
              <section className="inspector__section">
                <label className="field">
                  <span className="field__label">テキスト</span>
                  <input
                    value={textClip.text}
                    onChange={(e) => editor.updateClip(clip.id, { text: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="field__label">サイズ</span>
                  <input
                    type="number"
                    value={textClip.fontSize}
                    onChange={(e) =>
                      editor.updateClip(clip.id, { fontSize: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="field">
                  <span className="field__label">色</span>
                  <input
                    type="color"
                    value={textClip.color}
                    onChange={(e) => editor.updateClip(clip.id, { color: e.target.value })}
                  />
                </label>
              </section>
            )}

            <section className="inspector__section">
              <label className="field">
                <span className="field__label">再生速度</span>
                <div className="field__range-row">
                  <input
                    type="range"
                    min={0.25}
                    max={4}
                    step={0.25}
                    value={clip.speed}
                    onChange={(e) => editor.updateClip(clip.id, { speed: Number(e.target.value) })}
                  />
                  <span>{clip.speed}×</span>
                </div>
              </label>
              {!isText && (origin === "media" || origin === "daw" || origin === "video-linked") && (
                <label className="field">
                  <span className="field__label">クリップ音量</span>
                  <div className="field__range-row">
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.05}
                      value={clip.volume}
                      onChange={(e) =>
                        editor.updateClip(clip.id, { volume: Number(e.target.value) })
                      }
                    />
                    <span>{Math.round(clip.volume * 100)}%</span>
                  </div>
                </label>
              )}
              <label className="field">
                <span className="field__label">不透明度</span>
                <div className="field__range-row">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={clip.opacity}
                    onChange={(e) =>
                      editor.updateClip(clip.id, { opacity: Number(e.target.value) })
                    }
                  />
                  <span>{clip.opacity}%</span>
                </div>
              </label>
            </section>

            <section className="inspector__section">
              <h3 className="inspector__section-title">トランジション</h3>
              <div className="inspector__row-btns">
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => editor.setTransition(clip.id, "crossfade", 0.5)}
                >
                  クロスフェード
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => editor.setTransition(clip.id, "none")}
                >
                  なし
                </button>
              </div>
            </section>

            <div className="inspector__actions">
              <button type="button" className="btn btn--sm" onClick={() => editor.duplicateClip(clip.id)}>
                複製
              </button>
              <button
                type="button"
                className="btn btn--sm btn--danger"
                onClick={() => editor.deleteClip(clip.id)}
              >
                削除
              </button>
            </div>
          </>
        )}

        {hasClip && !isText && tab === "fx" && (
          <section className="inspector__section">
            <p className="inspector__hint">映像クリップにかかるフィルターです。</p>
            {(["brightness", "contrast", "saturation", "blur", "grayscale", "sepia"] as const).map(
              (key) => (
                <label key={key} className="field">
                  <span className="field__label">{FX_LABELS[key]}</span>
                  <input
                    type="range"
                    min={0}
                    max={
                      key === "blur"
                        ? 20
                        : key === "brightness" || key === "contrast" || key === "saturation"
                          ? 200
                          : 100
                    }
                    value={(clip as TimelineClip).effects[key]}
                    onChange={(e) =>
                      editor.updateEffects(clip.id, { [key]: Number(e.target.value) })
                    }
                  />
                </label>
              )
            )}
          </section>
        )}
      </div>
    </aside>
  );
};
