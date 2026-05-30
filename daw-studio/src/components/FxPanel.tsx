import { Sliders, Music2 } from "lucide-react";
import type { PitchNote, Track } from "../types";
import { trackTimelineEnd } from "../types";
import { FX_TOOLTIPS } from "../data/fxTooltips";
import { formatTime } from "../utils/time";
import { EffectKnob } from "./EffectKnob";
import { PitchEditor } from "./PitchEditor";

export type FxMode = "fx" | "pitch";

type Props = {
  height: number;
  selectedTrack: Track | undefined;
  onResizeStart: (e: React.MouseEvent) => void;
  onUpdate: (id: number, field: keyof Track, value: Track[keyof Track]) => void;
  fxMode: FxMode;
  onFxModeChange: (mode: FxMode) => void;
  pitchClipId: number | null;
  onSelectPitchClip: (id: number) => void;
  playLocalTime: number | null;
  pitchAnalyzing: boolean;
  pitchApplying: boolean;
  pitchLimit: number;
  onPitchLimitChange: (n: number) => void;
  onChangeClipNotes: (notes: PitchNote[]) => void;
  onApplyPitch: () => void;
  onResetPitch: () => void;
  onReanalyzePitch: () => void;
};

export function FxPanel({
  height,
  selectedTrack,
  onResizeStart,
  onUpdate,
  fxMode,
  onFxModeChange,
  pitchClipId,
  onSelectPitchClip,
  playLocalTime,
  pitchAnalyzing,
  pitchApplying,
  pitchLimit,
  onPitchLimitChange,
  onChangeClipNotes,
  onApplyPitch,
  onResetPitch,
  onReanalyzePitch,
}: Props) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const pitchAllowed = !!selectedTrack && selectedTrack.kind !== "bgm";
  const mode: FxMode = pitchAllowed ? fxMode : "fx";
  const pitchClip =
    selectedTrack?.clips.find((c) => c.id === pitchClipId) ?? selectedTrack?.clips[0];

  return (
    <div className="fx-panel" style={{ height: `${height}px` }}>
      <div className="fx-panel__handle" onMouseDown={onResizeStart} title="ドラッグして高さを調整">
        <div className="fx-panel__handle-title">
          {mode === "pitch" ? <Music2 size={14} /> : <Sliders size={14} />}
          {mode === "pitch" ? "PITCH" : "EFFECTS"}
        </div>
        {pitchAllowed && (
          <div className="fx-panel__tabs" onMouseDown={(e) => e.stopPropagation()}>
            <button
              className={`fx-panel__tab${mode === "fx" ? " is-active" : ""}`}
              onClick={() => onFxModeChange("fx")}
            >
              <Sliders size={12} /> エフェクト
            </button>
            <button
              className={`fx-panel__tab${mode === "pitch" ? " is-active" : ""}`}
              onClick={() => onFxModeChange("pitch")}
            >
              <Music2 size={12} /> ピッチ編集
            </button>
          </div>
        )}
        <div className="fx-panel__handle-grip" />
      </div>

      <div className="fx-panel__body">
        {selectedTrack && mode === "pitch" && pitchClip ? (
          <div className="fx-panel__pitch">
            {selectedTrack.clips.length > 1 && (
              <div className="fx-panel__takes">
                <span>テイク</span>
                {selectedTrack.clips.map((c, i) => (
                  <button
                    key={c.id}
                    className={`fx-panel__take${c.id === pitchClip.id ? " is-active" : ""}`}
                    onClick={() => onSelectPitchClip(c.id)}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
            <PitchEditor
              clip={pitchClip}
              trackColor={selectedTrack.color}
              playLocalTime={playLocalTime}
              analyzing={pitchAnalyzing}
              applying={pitchApplying}
              limit={pitchLimit}
              onLimitChange={onPitchLimitChange}
              onChangeNotes={onChangeClipNotes}
              onApply={onApplyPitch}
              onReset={onResetPitch}
              onReanalyze={onReanalyzePitch}
            />
          </div>
        ) : selectedTrack ? (
          <div className="fx-panel__content">
            <div className="fx-panel__track-info">
              <div className="fx-panel__track-name" style={{ color: selectedTrack.color }}>
                {selectedTrack.name}
              </div>
              <div className="fx-panel__track-meta">
                {selectedTrack.kind === "bgm" ? "BGM / オケ" : "ボーカル / 録音"} ·{" "}
                テイク {selectedTrack.clips.length} · {formatTime(trackTimelineEnd(selectedTrack))}
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

            <div className="fx-panel__knob-strip">
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
              <div className="fx-panel__knob-divider" aria-hidden />
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
              <div className="fx-panel__knob-divider" aria-hidden />
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
              <div className="fx-panel__knob-divider" aria-hidden />
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
              <div className="fx-panel__knob-divider" aria-hidden />
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
        ) : (
          <div className="fx-panel__empty">
            クリップをクリックしてトラックを選択 — 全10種のエフェクトをここで調整
          </div>
        )}
      </div>
    </div>
  );
}
