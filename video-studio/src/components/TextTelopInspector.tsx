import type { EditorApi } from "../hooks/useEditor";
import type { TextClip } from "../types";
import { TELOP_PRESETS } from "../text/telopPresets";
import { FONT_OPTIONS, type TextAnimKind } from "../text/textStyle";

const ANIM_IN: { value: TextAnimKind; label: string }[] = [
  { value: "none", label: "なし" },
  { value: "fade", label: "フェード" },
  { value: "pop", label: "ポップ" },
  { value: "slideUp", label: "下から" },
  { value: "slideDown", label: "上から" },
  { value: "slideLeft", label: "右から" },
  { value: "slideRight", label: "左から" },
  { value: "typewriter", label: "タイプライター" },
  { value: "karaoke", label: "カラオケ（ワイプ）" },
  { value: "wipe", label: "ワイプ" },
];

const ANIM_OUT = ANIM_IN.filter((a) => a.value !== "typewriter" && a.value !== "karaoke" && a.value !== "wipe");

interface Props {
  clip: TextClip;
  editor: EditorApi;
}

export const TextTelopInspector = ({ clip, editor }: Props) => {
  const st = clip.style;

  return (
    <div className="telop-inspector">
      <p className="telop-inspector__hint">
        プレビュー上を<strong>ドラッグ</strong>して位置を動かせます。改行で2行テロップにも対応。
      </p>

      <section className="telop-inspector__section">
        <h3 className="inspector__section-title">テンプレート</h3>
        <div className="telop-preset-grid">
          {TELOP_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="telop-preset-btn"
              title={p.description}
              onClick={() => editor.applyTelopPreset(clip.id, p.id)}
            >
              <span className="telop-preset-btn__name">{p.name}</span>
              <span className="telop-preset-btn__desc">{p.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="telop-inspector__section">
        <label className="field">
          <span className="field__label">テキスト</span>
          <textarea
            className="telop-textarea"
            rows={3}
            value={clip.text}
            onChange={(e) => editor.updateClip(clip.id, { text: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field__label">フォント</span>
          <select
            value={st.fontFamily}
            onChange={(e) => editor.updateTextStyle(clip.id, { fontFamily: e.target.value })}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <div className="telop-inspector__row2">
          <label className="field">
            <span className="field__label">サイズ</span>
            <input
              type="number"
              min={12}
              max={200}
              value={st.fontSize}
              onChange={(e) => editor.updateTextStyle(clip.id, { fontSize: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span className="field__label">太さ</span>
            <select
              value={st.fontWeight}
              onChange={(e) => editor.updateTextStyle(clip.id, { fontWeight: Number(e.target.value) })}
            >
              <option value={400}>標準</option>
              <option value={500}>中</option>
              <option value={600}>やや太</option>
              <option value={700}>太</option>
              <option value={800}>極太</option>
              <option value={900}>最大</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span className="field__label">字間（px）</span>
          <input
            type="range"
            min={-2}
            max={20}
            value={st.letterSpacing}
            onChange={(e) => editor.updateTextStyle(clip.id, { letterSpacing: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          <span className="field__label">行間</span>
          <input
            type="range"
            min={1}
            max={2.5}
            step={0.05}
            value={st.lineHeight}
            onChange={(e) => editor.updateTextStyle(clip.id, { lineHeight: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          <span className="field__label">揃え</span>
          <select
            value={st.textAlign}
            onChange={(e) =>
              editor.updateTextStyle(clip.id, {
                textAlign: e.target.value as TextClip["style"]["textAlign"],
              })
            }
          >
            <option value="left">左</option>
            <option value="center">中央</option>
            <option value="right">右</option>
          </select>
        </label>
      </section>

      <section className="telop-inspector__section">
        <h3 className="inspector__section-title">色・装飾</h3>
        <label className="field field--row">
          <input
            type="checkbox"
            checked={st.gradient.enabled}
            onChange={(e) =>
              editor.updateTextStyle(clip.id, { gradient: { ...st.gradient, enabled: e.target.checked } })
            }
          />
          <span>グラデーション文字</span>
        </label>
        {st.gradient.enabled ? (
          <div className="telop-inspector__row2">
            <label className="field">
              <span className="field__label">開始色</span>
              <input
                type="color"
                value={st.gradient.colorStart}
                onChange={(e) =>
                  editor.updateTextStyle(clip.id, { gradient: { ...st.gradient, colorStart: e.target.value } })
                }
              />
            </label>
            <label className="field">
              <span className="field__label">終了色</span>
              <input
                type="color"
                value={st.gradient.colorEnd}
                onChange={(e) =>
                  editor.updateTextStyle(clip.id, { gradient: { ...st.gradient, colorEnd: e.target.value } })
                }
              />
            </label>
          </div>
        ) : (
          <label className="field">
            <span className="field__label">文字色</span>
            <input
              type="color"
              value={st.color}
              onChange={(e) => editor.updateTextStyle(clip.id, { color: e.target.value })}
            />
          </label>
        )}

        <label className="field field--row">
          <input
            type="checkbox"
            checked={st.stroke.enabled}
            onChange={(e) =>
              editor.updateTextStyle(clip.id, { stroke: { ...st.stroke, enabled: e.target.checked } })
            }
          />
          <span>縁取り（フチ）</span>
        </label>
        {st.stroke.enabled && (
          <div className="telop-inspector__row2">
            <label className="field">
              <span className="field__label">縁の色</span>
              <input
                type="color"
                value={st.stroke.color}
                onChange={(e) =>
                  editor.updateTextStyle(clip.id, { stroke: { ...st.stroke, color: e.target.value } })
                }
              />
            </label>
            <label className="field">
              <span className="field__label">太さ</span>
              <input
                type="range"
                min={1}
                max={16}
                value={st.stroke.width}
                onChange={(e) =>
                  editor.updateTextStyle(clip.id, { stroke: { ...st.stroke, width: Number(e.target.value) } })
                }
              />
            </label>
          </div>
        )}

        <label className="field field--row">
          <input
            type="checkbox"
            checked={st.shadow.enabled}
            onChange={(e) =>
              editor.updateTextStyle(clip.id, { shadow: { ...st.shadow, enabled: e.target.checked } })
            }
          />
          <span>ドロップシャドウ</span>
        </label>
        {st.shadow.enabled && (
          <>
            <label className="field">
              <span className="field__label">ぼかし</span>
              <input
                type="range"
                min={0}
                max={32}
                value={st.shadow.blur}
                onChange={(e) =>
                  editor.updateTextStyle(clip.id, { shadow: { ...st.shadow, blur: Number(e.target.value) } })
                }
              />
            </label>
            <div className="telop-inspector__row2">
              <label className="field">
                <span className="field__label">X</span>
                <input
                  type="range"
                  min={-20}
                  max={20}
                  value={st.shadow.offsetX}
                  onChange={(e) =>
                    editor.updateTextStyle(clip.id, {
                      shadow: { ...st.shadow, offsetX: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">Y</span>
                <input
                  type="range"
                  min={-20}
                  max={20}
                  value={st.shadow.offsetY}
                  onChange={(e) =>
                    editor.updateTextStyle(clip.id, {
                      shadow: { ...st.shadow, offsetY: Number(e.target.value) },
                    })
                  }
                />
              </label>
            </div>
          </>
        )}

        <label className="field field--row">
          <input
            type="checkbox"
            checked={st.background.enabled}
            onChange={(e) =>
              editor.updateTextStyle(clip.id, { background: { ...st.background, enabled: e.target.checked } })
            }
          />
          <span>背景ボックス</span>
        </label>
        {st.background.enabled && (
          <>
            <label className="field">
              <span className="field__label">背景色</span>
              <input
                type="color"
                value={st.background.color}
                onChange={(e) =>
                  editor.updateTextStyle(clip.id, { background: { ...st.background, color: e.target.value } })
                }
              />
            </label>
            <label className="field">
              <span className="field__label">不透明度</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={st.background.opacity}
                onChange={(e) =>
                  editor.updateTextStyle(clip.id, {
                    background: { ...st.background, opacity: Number(e.target.value) },
                  })
                }
              />
            </label>
          </>
        )}
      </section>

      <section className="telop-inspector__section">
        <h3 className="inspector__section-title">位置・回転</h3>
        <label className="field">
          <span className="field__label">横位置</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(clip.x * 100)}
            onChange={(e) => editor.updateClip(clip.id, { x: Number(e.target.value) / 100 })}
          />
        </label>
        <label className="field">
          <span className="field__label">縦位置</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(clip.y * 100)}
            onChange={(e) => editor.updateClip(clip.id, { y: Number(e.target.value) / 100 })}
          />
        </label>
        <label className="field">
          <span className="field__label">回転（°）</span>
          <input
            type="range"
            min={-45}
            max={45}
            value={st.rotation}
            onChange={(e) => editor.updateTextStyle(clip.id, { rotation: Number(e.target.value) })}
          />
        </label>
      </section>

      <section className="telop-inspector__section">
        <h3 className="inspector__section-title">アニメーション</h3>
        <label className="field">
          <span className="field__label">入り</span>
          <select
            value={st.animation.in}
            onChange={(e) =>
              editor.updateTextStyle(clip.id, {
                animation: { ...st.animation, in: e.target.value as TextAnimKind },
              })
            }
          >
            {ANIM_IN.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">入り時間（秒）</span>
          <input
            type="number"
            min={0}
            max={10}
            step={0.05}
            value={st.animation.inDuration}
            onChange={(e) =>
              editor.updateTextStyle(clip.id, {
                animation: { ...st.animation, inDuration: Number(e.target.value) },
              })
            }
          />
        </label>
        <label className="field">
          <span className="field__label">抜け</span>
          <select
            value={st.animation.out}
            onChange={(e) =>
              editor.updateTextStyle(clip.id, {
                animation: { ...st.animation, out: e.target.value as TextAnimKind },
              })
            }
          >
            {ANIM_OUT.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">抜け時間（秒）</span>
          <input
            type="number"
            min={0}
            max={5}
            step={0.05}
            value={st.animation.outDuration}
            onChange={(e) =>
              editor.updateTextStyle(clip.id, {
                animation: { ...st.animation, outDuration: Number(e.target.value) },
              })
            }
          />
        </label>
      </section>
    </div>
  );
};
