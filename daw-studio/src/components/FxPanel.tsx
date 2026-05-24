import { Sliders } from "lucide-react";
import type { Track } from "../types";
import { FX_TOOLTIPS } from "../data/fxTooltips";
import { formatTime } from "../utils/time";
import { EffectKnob } from "./EffectKnob";

type Props = {
  height: number;
  selectedTrack: Track | undefined;
  onResizeStart: (e: React.MouseEvent) => void;
  onUpdate: (id: number, field: keyof Track, value: Track[keyof Track]) => void;
};

export function FxPanel({ height, selectedTrack, onResizeStart, onUpdate }: Props) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="fx-panel" style={{ height: `${height}px` }}>
      <div className="fx-panel__handle" onMouseDown={onResizeStart} title="ドラッグして高さを調整">
        <div className="fx-panel__handle-title">
          <Sliders size={14} /> EFFECTS
        </div>
        <div className="fx-panel__handle-grip" />
      </div>

      <div className="fx-panel__body">
        {selectedTrack ? (
          <div className="fx-panel__content">
            <div className="fx-panel__track-info">
              <div className="fx-panel__track-name" style={{ color: selectedTrack.color }}>
                {selectedTrack.name}
              </div>
              <div className="fx-panel__track-meta">
                {selectedTrack.kind === "bgm" ? "BGM / オケ" : "ボーカル / 録音"} ·{" "}
                {formatTime(selectedTrack.duration || 0)} · offset {formatTime(selectedTrack.offset)}
                {(selectedTrack.nudgeMs ?? 0) !== 0 && (
                  <> · nudge {selectedTrack.nudgeMs > 0 ? "+" : ""}{selectedTrack.nudgeMs.toFixed(1)} ms</>
                )}
              </div>
              <EffectKnob
                label="タイミング補正"
                min="-100"
                max="100"
                step="0.1"
                value={selectedTrack.nudgeMs ?? 0}
                onChange={(v) => onUpdate(selectedTrack.id, "nudgeMs", v)}
                defaultValue={0}
                formatValue={(v) =>
                  (v === 0 ? "0" : v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) + " ms"
                }
                helpTitle={FX_TOOLTIPS.nudgeMs.title}
                helpDescription={FX_TOOLTIPS.nudgeMs.description}
              />
              <p className="fx-panel__nudge-hint">
                録音が BGM より遅れて聞こえる → マイナス方向へ（0.1 ms 刻み）
              </p>
              <div className="fx-panel__knob-row">
                <EffectKnob
                  label="再生速度"
                  min="0.5"
                  max="2"
                  step="0.01"
                  value={selectedTrack.speed}
                  onChange={(v) => onUpdate(selectedTrack.id, "speed", v)}
                  defaultValue={1}
                  formatValue={(v) => `${v.toFixed(2)}x`}
                  helpTitle={FX_TOOLTIPS.speed.title}
                  helpDescription={FX_TOOLTIPS.speed.description}
                />
                <EffectKnob
                  label="キー変更"
                  min="-12"
                  max="12"
                  step="1"
                  value={selectedTrack.pitch}
                  onChange={(v) => onUpdate(selectedTrack.id, "pitch", v)}
                  defaultValue={0}
                  formatValue={(v) => (v === 0 ? "0" : v > 0 ? `+${v}` : `${v}`) + " sem"}
                  helpTitle={FX_TOOLTIPS.pitch.title}
                  helpDescription={FX_TOOLTIPS.pitch.description}
                />
              </div>
            </div>

            <div className="fx-panel__sections">
              <div className="fx-section" data-cols="3">
                <div className="fx-section__title">Pan · トーン</div>
                <div className="fx-section__knobs">
                  <EffectKnob
                    label="L ◀ Pan ▶ R"
                    min="-1"
                    max="1"
                    step="0.01"
                    value={selectedTrack.pan}
                    onChange={(v) => onUpdate(selectedTrack.id, "pan", v)}
                    formatValue={(v) =>
                      v === 0 ? "C" : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`
                    }
                    defaultValue={0}
                    helpTitle={FX_TOOLTIPS.pan.title}
                    helpDescription={FX_TOOLTIPS.pan.description}
                  />
                  <EffectKnob
                    label="低音 Bass"
                    min="-15"
                    max="15"
                    step="1"
                    value={selectedTrack.bass}
                    onChange={(v) => onUpdate(selectedTrack.id, "bass", v)}
                    unit=" dB"
                    defaultValue={0}
                    helpTitle={FX_TOOLTIPS.bass.title}
                    helpDescription={FX_TOOLTIPS.bass.description}
                  />
                  <EffectKnob
                    label="高音 Treble"
                    min="-15"
                    max="15"
                    step="1"
                    value={selectedTrack.treble}
                    onChange={(v) => onUpdate(selectedTrack.id, "treble", v)}
                    unit=" dB"
                    defaultValue={0}
                    helpTitle={FX_TOOLTIPS.treble.title}
                    helpDescription={FX_TOOLTIPS.treble.description}
                  />
                </div>
              </div>

              <div className="fx-section" data-cols="2">
                <div className="fx-section__title">ダイナミクス</div>
                <div className="fx-section__knobs">
                  <EffectKnob
                    label="コンプ"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedTrack.compressor}
                    onChange={(v) => onUpdate(selectedTrack.id, "compressor", v)}
                    formatValue={pct}
                    defaultValue={0}
                    helpTitle={FX_TOOLTIPS.compressor.title}
                    helpDescription={FX_TOOLTIPS.compressor.description}
                  />
                  <EffectKnob
                    label="ノイズ除去"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedTrack.noiseReduce}
                    onChange={(v) => onUpdate(selectedTrack.id, "noiseReduce", v)}
                    formatValue={pct}
                    defaultValue={0}
                    helpTitle={FX_TOOLTIPS.noiseReduce.title}
                    helpDescription={FX_TOOLTIPS.noiseReduce.description}
                  />
                </div>
              </div>

              <div className="fx-section" data-cols="2">
                <div className="fx-section__title">空間</div>
                <div className="fx-section__knobs">
                  <EffectKnob
                    label="リバーブ"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedTrack.reverb}
                    onChange={(v) => onUpdate(selectedTrack.id, "reverb", v)}
                    formatValue={pct}
                    defaultValue={0}
                    helpTitle={FX_TOOLTIPS.reverb.title}
                    helpDescription={FX_TOOLTIPS.reverb.description}
                  />
                  <EffectKnob
                    label="ディレイ"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedTrack.delay}
                    onChange={(v) => onUpdate(selectedTrack.id, "delay", v)}
                    formatValue={pct}
                    defaultValue={0}
                    helpTitle={FX_TOOLTIPS.delay.title}
                    helpDescription={FX_TOOLTIPS.delay.description}
                  />
                </div>
              </div>

              <div className="fx-section" data-cols="2">
                <div className="fx-section__title">モジュレーション</div>
                <div className="fx-section__knobs">
                  <EffectKnob
                    label="コーラス"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedTrack.chorus}
                    onChange={(v) => onUpdate(selectedTrack.id, "chorus", v)}
                    formatValue={pct}
                    defaultValue={0}
                    helpTitle={FX_TOOLTIPS.chorus.title}
                    helpDescription={FX_TOOLTIPS.chorus.description}
                  />
                  <EffectKnob
                    label="トレモロ"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedTrack.tremolo}
                    onChange={(v) => onUpdate(selectedTrack.id, "tremolo", v)}
                    formatValue={pct}
                    defaultValue={0}
                    helpTitle={FX_TOOLTIPS.tremolo.title}
                    helpDescription={FX_TOOLTIPS.tremolo.description}
                  />
                </div>
              </div>

              <div className="fx-section" data-cols="2">
                <div className="fx-section__title">フェード</div>
                <div className="fx-section__knobs">
                  <EffectKnob
                    label="フェードイン"
                    min="0"
                    max="10"
                    step="0.1"
                    value={selectedTrack.fadeIn}
                    onChange={(v) => onUpdate(selectedTrack.id, "fadeIn", v)}
                    unit="s"
                    defaultValue={0}
                    helpTitle={FX_TOOLTIPS.fadeIn.title}
                    helpDescription={FX_TOOLTIPS.fadeIn.description}
                  />
                  <EffectKnob
                    label="フェードアウト"
                    min="0"
                    max="10"
                    step="0.1"
                    value={selectedTrack.fadeOut}
                    onChange={(v) => onUpdate(selectedTrack.id, "fadeOut", v)}
                    unit="s"
                    defaultValue={0}
                    helpTitle={FX_TOOLTIPS.fadeOut.title}
                    helpDescription={FX_TOOLTIPS.fadeOut.description}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="fx-panel__empty">
            クリップをクリックしてトラックを選択 — 全10種のエフェクトをここで調整
          </div>
        )}
      </div>
    </div>
  );
}
