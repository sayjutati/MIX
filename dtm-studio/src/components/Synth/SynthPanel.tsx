import type { SynthParams, Waveform } from "../../types/project";

type Props = {
  params: SynthParams;
  instrumentName: string;
  onChange: (patch: Partial<SynthParams>) => void;
};

const WAVEFORMS: { id: Waveform; label: string }[] = [
  { id: "sine", label: "Sine" },
  { id: "saw", label: "Saw" },
  { id: "square", label: "Square" },
];

export function SynthPanel({ params, instrumentName, onChange }: Props) {
  return (
    <aside className="synth-panel">
      <div className="synth-panel__title">Synth · {instrumentName}</div>
      <label className="synth-panel__row">
        Wave
        <select
          value={params.waveform}
          onChange={(e) => onChange({ waveform: e.target.value as Waveform })}
        >
          {WAVEFORMS.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </select>
      </label>
      {(["attack", "decay", "sustain", "release"] as const).map((key) => (
        <label key={key} className="synth-panel__row">
          {key.toUpperCase()}
          <input
            type="range"
            min={key === "sustain" ? 0 : 0.005}
            max={key === "sustain" ? 1 : 1}
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
