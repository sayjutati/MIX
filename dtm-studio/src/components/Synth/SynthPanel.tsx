import type { SynthParams, Waveform } from "../../types/project";
import { ADSR_LABELS, WAVEFORM_LABELS, instrumentDisplayName } from "../../data/uiLabels";
import type { InstrumentKind } from "../../types/project";

type Props = {
  params: SynthParams;
  instrumentName: string;
  instrumentKind?: InstrumentKind;
  onChange: (patch: Partial<SynthParams>) => void;
};

const WAVEFORMS: Waveform[] = ["sine", "saw", "square"];

export function SynthPanel({ params, instrumentName, instrumentKind, onChange }: Props) {
  const displayName = instrumentDisplayName(instrumentKind, instrumentName);

  return (
    <aside className="synth-panel">
      <div className="synth-panel__title">シンセ · {displayName}</div>
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
