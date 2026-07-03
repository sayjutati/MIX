import type { InstrumentEngine, SynthParams, Waveform } from "../../types/project";
import { ADSR_LABELS, WAVEFORM_LABELS, instrumentDisplayName } from "../../data/uiLabels";
import type { InstrumentKind } from "../../types/project";
import { DRUM_LABELS, fixedDrumVoice } from "../../audio/drumMap";
import { patchForKind } from "../../audio/voicePatch";

type Props = {
  params: SynthParams;
  instrumentName: string;
  instrumentKind?: InstrumentKind;
  engine?: InstrumentEngine;
  onChange: (patch: Partial<SynthParams>) => void;
};

const WAVEFORMS: Waveform[] = ["sine", "saw", "square", "triangle", "noise"];

export function SynthPanel({
  params,
  instrumentName,
  instrumentKind,
  engine = "synth",
  onChange,
}: Props) {
  const displayName = instrumentDisplayName(instrumentKind, instrumentName);

  if (engine === "drum") {
    const isFixedDrum = instrumentKind ? fixedDrumVoice(instrumentKind) != null : false;
    return (
      <aside className="synth-panel">
        <div className="synth-panel__title">音色エディタ</div>
        <div className="synth-panel__subtitle">{displayName}</div>
        {isFixedDrum ? (
          <p className="synth-panel__drum-hint">
            単体ドラム音源です。どの鍵盤を押しても同じ音が鳴ります。
          </p>
        ) : (
          <>
            <div className="synth-panel__section">ドラムマップ</div>
            <p className="synth-panel__drum-hint">
              ノートの高さでパッドが変わります。鍵盤・ピアノロールにパッド名を表示しています。
            </p>
            <ul className="synth-panel__drum-map">
              {Object.entries(DRUM_LABELS).map(([pitch, label]) => (
                <li key={pitch}>
                  <span className="synth-panel__drum-pitch">{pitch}</span>
                  {label}
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
    );
  }

  const hasPatch = instrumentKind ? patchForKind(instrumentKind) != null : false;
  const isSampler = instrumentKind === "voice";

  return (
    <aside className="synth-panel">
      <div className="synth-panel__title">音色エディタ</div>
      <div className="synth-panel__subtitle">{displayName}</div>
      <div className="synth-panel__section">オシレーター</div>
      {isSampler ? (
        <p className="synth-panel__drum-hint">
          録音した声のサンプラー音源です。ノートの高さに合わせてピッチシフトして鳴ります。エンベロープは下で調整できます。
        </p>
      ) : hasPatch ? (
        <p className="synth-panel__drum-hint">
          専用パッチ音源（マルチオシレーター＋フィルター）です。エンベロープは下で調整できます。
        </p>
      ) : (
      <label className="synth-panel__row tooltip" data-tooltip="基本波形の種類">
        波形
        <select
          value={params.waveform}
          onChange={(e) => onChange({ waveform: e.target.value as Waveform })}
        >
          {WAVEFORMS.map((w) => (
            <option key={w} value={w}>
              {WAVEFORM_LABELS[w]}
            </option>
          ))}
        </select>
      </label>
      )}
      <div className="synth-panel__section">エンベロープ（ADSR）</div>
      {(["attack", "decay", "sustain", "release"] as const).map((key) => (
        <label
          key={key}
          className="synth-panel__row tooltip"
          data-tooltip={
            key === "attack"
              ? "音が鳴り始めるまでの時間"
              : key === "decay"
                ? "ピークからサステインへ下がる時間"
                : key === "sustain"
                  ? "キーを押し続けたときの音量レベル"
                  : "キーを離してから消えるまでの時間"
          }
        >
          {ADSR_LABELS[key]}
          <input
            type="range"
            min={key === "sustain" ? 0 : 0.005}
            max={1}
            step={key === "sustain" ? 0.01 : 0.005}
            value={params[key]}
            onChange={(e) => onChange({ [key]: Number(e.target.value) })}
          />
          <span className="synth-panel__val">{params[key].toFixed(2)}</span>
        </label>
      ))}
    </aside>
  );
}
