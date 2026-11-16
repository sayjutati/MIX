import { Sliders, Music2 } from "lucide-react";
import type { ReactNode } from "react";
import { MELODY_VOICES, type MelodyVoiceId, type PitchNote, type Track } from "../types";
import { trackTimelineEnd } from "../types";
import { FX_TOOLTIPS } from "../data/fxTooltips";
import { formatTime } from "../utils/time";
import { EffectSlider, type EffectSliderProps } from "./EffectSlider";
import { PitchEditor } from "./PitchEditor";
import { TakeComp } from "./TakeComp";

export type FxMode = "fx" | "pitch";

/** ワンタップで複数エフェクトをまとめて設定するプリセット */
export const FX_PRESETS: { id: string; label: string; values: Partial<Track> }[] = [
  { id: "reset", label: "リセット（素の音）", values: { bass: 0, treble: 0, compressor: 0, deEss: 0, noiseReduce: 0, reverb: 0, delay: 0, chorus: 0, tremolo: 0 } },
  { id: "vocal", label: "ボーカル標準", values: { bass: 1, treble: 3, compressor: 0.45, deEss: 0.4, noiseReduce: 0.15, reverb: 0.18, delay: 0, chorus: 0 } },
  { id: "pop", label: "ポップス（前に出す）", values: { bass: 2, treble: 4, compressor: 0.6, deEss: 0.5, noiseReduce: 0.1, reverb: 0.22, delay: 0.12, chorus: 0.15 } },
  { id: "ballad", label: "バラード（広い響き）", values: { bass: 1, treble: 2, compressor: 0.35, deEss: 0.35, noiseReduce: 0.1, reverb: 0.4, delay: 0.18, chorus: 0.1 } },
  { id: "natural", label: "ナチュラル（控えめ）", values: { bass: 0, treble: 1, compressor: 0.25, deEss: 0.25, noiseReduce: 0.08, reverb: 0.12, delay: 0, chorus: 0 } },
  { id: "radio", label: "ラジオボイス（細い）", values: { bass: -8, treble: 5, compressor: 0.7, deEss: 0.3, noiseReduce: 0.2, reverb: 0, delay: 0, chorus: 0 } },
];

type SliderField = keyof typeof FX_TOOLTIPS & keyof Track;

type Props = {
  height: number;
  selectedTrack: Track | undefined;
  onResizeStart: (e: React.MouseEvent) => void;
  onUpdate: (id: number, field: keyof Track, value: Track[keyof Track]) => void;
  onApplyPreset: (id: number, values: Partial<Track>) => void;
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
  onSelectTake: (trackId: number, clipId: number) => void;
  onAuditionTake: (trackId: number, clipId: number) => void;
  onToggleTakeMuted: (trackId: number, clipId: number) => void;
  onChangeVoice?: (trackId: number, voice: MelodyVoiceId) => void;
  voiceBusy?: boolean;
};

function FxGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="fx-group">
      <div className="fx-group__title">{title}</div>
      <div className="fx-group__body">{children}</div>
    </section>
  );
}

export function FxPanel({
  selectedTrack,
  onResizeStart,
  onUpdate,
  onApplyPreset,
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
  onSelectTake,
  onAuditionTake,
  onToggleTakeMuted,
  onChangeVoice,
  voiceBusy,
}: Props) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const signed = (v: number, digits = 0) =>
    v === 0 ? "0" : v > 0 ? `+${v.toFixed(digits)}` : v.toFixed(digits);
  const pitchAllowed = !!selectedTrack && selectedTrack.kind !== "bgm";
  const mode: FxMode = pitchAllowed ? fxMode : "fx";
  const pitchClip =
    selectedTrack?.clips.find((c) => c.id === pitchClipId) ?? selectedTrack?.clips[0];

  const slider = (
    track: Track,
    field: SliderField,
    label: string,
    range: [min: string, max: string, step: string],
    extra: Partial<EffectSliderProps> = {}
  ) => (
    <EffectSlider
      key={field}
      label={label}
      min={range[0]}
      max={range[1]}
      step={range[2]}
      value={(track[field] as number | undefined) ?? 0}
      onChange={(v) => onUpdate(track.id, field, v)}
      defaultValue={0}
      helpTitle={FX_TOOLTIPS[field].title}
      helpDescription={FX_TOOLTIPS[field].description}
      {...extra}
    />
  );

  return (
    <div className="fx-panel" style={{ height: "100%" }}>
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
                {selectedTrack.kind === "bgm" ? "BGM / オケ" : "ボーカル / 録音"} · テイク{" "}
                {selectedTrack.clips.length} · {formatTime(trackTimelineEnd(selectedTrack))}
              </div>
              <label className="fx-panel__preset">
                <span>プリセット</span>
                <select
                  value=""
                  onChange={(e) => {
                    const p = FX_PRESETS.find((x) => x.id === e.target.value);
                    if (p) onApplyPreset(selectedTrack.id, p.values);
                    e.target.value = "";
                  }}
                >
                  <option value="" disabled>
                    選んで一発設定…
                  </option>
                  {FX_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              {selectedTrack.synthVoice && onChangeVoice && (
                <div className="fx-panel__voices">
                  <span>音色</span>
                  <div className="voice-picks">
                    {MELODY_VOICES.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className={`voice-picks__btn${selectedTrack.synthVoice === v.id ? " is-on" : ""}`}
                        disabled={voiceBusy}
                        onClick={() => onChangeVoice(selectedTrack.id, v.id)}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="fx-panel__groups">
              <FxGroup title="タイミング・キー">
                {slider(selectedTrack, "nudgeMs", "タイミング補正", ["-100", "100", "0.1"], {
                  formatValue: (v) => `${signed(v, 1)} ms`,
                })}
                {slider(selectedTrack, "speed", "再生速度", ["0.5", "2", "0.01"], {
                  defaultValue: 1,
                  formatValue: (v) => `${v.toFixed(2)}x`,
                })}
                {slider(selectedTrack, "pitch", "キー変更", ["-12", "12", "1"], {
                  formatValue: (v) => `${signed(v)} sem`,
                })}
              </FxGroup>
              <FxGroup title="定位・EQ">
                {slider(selectedTrack, "pan", "Pan（L ◀ ▶ R）", ["-1", "1", "0.01"], {
                  formatValue: (v) =>
                    v === 0 ? "C" : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`,
                })}
                {slider(selectedTrack, "bass", "低音 Bass", ["-15", "15", "1"], { unit: " dB" })}
                {slider(selectedTrack, "treble", "高音 Treble", ["-15", "15", "1"], { unit: " dB" })}
              </FxGroup>
              <FxGroup title="ダイナミクス">
                {slider(selectedTrack, "compressor", "コンプ", ["0", "1", "0.01"], { formatValue: pct })}
                {slider(selectedTrack, "noiseReduce", "ノイズ除去", ["0", "1", "0.01"], { formatValue: pct })}
                {slider(selectedTrack, "deEss", "ディエッサー", ["0", "1", "0.01"], { formatValue: pct })}
              </FxGroup>
              <FxGroup title="空間">
                {slider(selectedTrack, "reverb", "リバーブ", ["0", "1", "0.01"], { formatValue: pct })}
                {slider(selectedTrack, "delay", "ディレイ", ["0", "1", "0.01"], { formatValue: pct })}
              </FxGroup>
              <FxGroup title="揺れ・厚み">
                {slider(selectedTrack, "chorus", "コーラス", ["0", "1", "0.01"], { formatValue: pct })}
                {slider(selectedTrack, "tremolo", "トレモロ", ["0", "1", "0.01"], { formatValue: pct })}
              </FxGroup>
              <FxGroup title="フェード">
                {slider(selectedTrack, "fadeIn", "フェードイン", ["0", "10", "0.1"], { unit: "s" })}
                {slider(selectedTrack, "fadeOut", "フェードアウト", ["0", "10", "0.1"], { unit: "s" })}
              </FxGroup>
            </div>

            <TakeComp
              track={selectedTrack}
              onSelectTake={(clipId) => onSelectTake(selectedTrack.id, clipId)}
              onAuditionTake={(clipId) => onAuditionTake(selectedTrack.id, clipId)}
              onToggleTakeMuted={(clipId) => onToggleTakeMuted(selectedTrack.id, clipId)}
            />
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
