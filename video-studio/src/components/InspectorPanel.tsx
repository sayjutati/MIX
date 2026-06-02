import { getClipOrigin, getLinkedClip, isVideoClip, originLabel } from "../audio/clipAudio";
import type { EditorApi } from "../hooks/useEditor";
import type { EditorState, TextClip, TimelineClip } from "../types";

interface Props {
  state: EditorState;
  editor: EditorApi;
}

const selectedClip = (state: EditorState): TimelineClip | TextClip | null => {
  const id = state.selectedClipId;
  if (!id) return null;
  return state.textClips.find((c) => c.id === id) ?? state.clips.find((c) => c.id === id) ?? null;
};

export const InspectorPanel = ({ state, editor }: Props) => {
  const clip = selectedClip(state);
  const isText = clip && state.textClips.some((t) => t.id === clip.id);
  const textClip = isText ? (clip as TextClip) : null;
  const linked = clip && !isText ? getLinkedClip(state, clip.id) : null;
  const onVideo = clip && !isText && isVideoClip(state, clip as TimelineClip);
  const origin = clip && !isText ? getClipOrigin(clip as TimelineClip) : null;

  if (!clip) {
    return (
      <aside className="inspector">
        <h2>インスペクター</h2>
        <p className="inspector__hint">クリップを選択してプロパティを編集</p>
        <section>
          <h3>プロジェクト</h3>
          <label>
            タイトル
            <input value={state.title} onChange={(e) => editor.patch({ title: e.target.value })} />
          </label>
          <label>
            長さ (秒)
            <input
              type="number"
              min={1}
              value={state.duration}
              onChange={(e) => editor.patch({ duration: Number(e.target.value) })}
            />
          </label>
          <label>
            解像度
            <select
              value={`${state.previewWidth}x${state.previewHeight}`}
              onChange={(e) => {
                const [w, h] = e.target.value.split("x").map(Number);
                editor.patch({ previewWidth: w, previewHeight: h });
              }}
            >
              <option value="1920x1080">1920×1080</option>
              <option value="1280x720">1280×720</option>
              <option value="1080x1920">1080×1920 (縦)</option>
              <option value="1080x1080">1080×1080</option>
            </select>
          </label>
        </section>
      </aside>
    );
  }

  return (
    <aside className="inspector">
      <h2>クリップ</h2>

      {!isText && origin && (
        <section className="inspector__audio">
          <h3>音声</h3>
          <p className="inspector__origin">
            ソース: <strong>{originLabel[origin]}</strong>
          </p>
          {origin === "daw" && (
            <p className="inspector__note">
              DAW Studio のミックス音声です。動画に元から付いている音とは別トラックです。
            </p>
          )}
          {origin === "video-linked" && (
            <p className="inspector__note">
              動画ファイルから切り出した音声です。映像クリップとリンクして同期します。
            </p>
          )}
          {onVideo && linked && (
            <p className="inspector__note">
              映像は Video トラック、音声は Audio トラック（リンク）で再生されます。DAW
              ミックスとは別ソースです。
            </p>
          )}
          {(origin === "media" ||
            origin === "daw" ||
            origin === "video-linked" ||
            (onVideo && linked)) && (
            <label className="inspector__toggle">
              <input
                type="checkbox"
                checked={!(linked?.audioMuted ?? clip.audioMuted)}
                onChange={() =>
                  editor.toggleClipAudio(linked?.id ?? clip.id)
                }
              />
              クリップ音声を再生
            </label>
          )}
          {linked && (
            <>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => editor.patch({ selectedClipId: linked.id })}
              >
                リンク先を選択
              </button>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => editor.detachLinkedAudio(clip.id)}
              >
                リンク解除（独立編集）
              </button>
            </>
          )}
        </section>
      )}

      {textClip && (
        <>
          <label>
            テキスト
            <input
              value={textClip.text}
              onChange={(e) => editor.updateClip(clip.id, { text: e.target.value })}
            />
          </label>
          <label>
            サイズ
            <input
              type="number"
              value={textClip.fontSize}
              onChange={(e) => editor.updateClip(clip.id, { fontSize: Number(e.target.value) })}
            />
          </label>
          <label>
            色
            <input
              type="color"
              value={textClip.color}
              onChange={(e) => editor.updateClip(clip.id, { color: e.target.value })}
            />
          </label>
        </>
      )}

      <label>
        速度
        <input
          type="range"
          min={0.25}
          max={4}
          step={0.25}
          value={clip.speed}
          onChange={(e) => editor.updateClip(clip.id, { speed: Number(e.target.value) })}
        />
        {clip.speed}x
      </label>
      {!isText && (origin === "media" || origin === "daw" || origin === "video-linked") && (
        <label>
          音量
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={clip.volume}
            onChange={(e) => editor.updateClip(clip.id, { volume: Number(e.target.value) })}
          />
          {Math.round(clip.volume * 100)}%
        </label>
      )}
      <label>
        不透明度 %
        <input
          type="range"
          min={0}
          max={100}
          value={clip.opacity}
          onChange={(e) => editor.updateClip(clip.id, { opacity: Number(e.target.value) })}
        />
      </label>
      {!isText && (
        <section>
          <h3>映像 FX</h3>
          {(["brightness", "contrast", "saturation", "blur", "grayscale", "sepia"] as const).map(
            (key) => (
              <label key={key}>
                {key}
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
      <section>
        <h3>トランジション</h3>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => editor.setTransition(clip.id, "crossfade", 0.5)}
        >
          クロスフェード
        </button>
        <button type="button" className="btn btn--sm" onClick={() => editor.setTransition(clip.id, "none")}>
          なし
        </button>
      </section>
      <div className="inspector__actions">
        <button type="button" className="btn btn--sm" onClick={() => editor.duplicateClip(clip.id)}>
          複製
        </button>
        <button type="button" className="btn btn--sm btn--danger" onClick={() => editor.deleteClip(clip.id)}>
          削除
        </button>
      </div>
    </aside>
  );
};
