import type React from "react";

type Props = {
  label: string;
  min: string;
  max: string;
  step: string;
  value: number;
  onChange: (val: number) => void;
  unit?: string;
  defaultValue?: number;
  formatValue?: (v: number) => string;
};

export function EffectKnob({
  label,
  min,
  max,
  step,
  value,
  onChange,
  unit = "",
  defaultValue = 0,
  formatValue,
}: Props) {
  const minN = parseFloat(min);
  const maxN = parseFloat(max);
  const stepN = parseFloat(step);
  const fill = maxN === minN ? 0 : (value - minN) / (maxN - minN);
  const angle = -135 + fill * 270;
  const display = formatValue ? formatValue(value) : `${value}${unit}`;

  const nudge = (delta: number) => {
    const next = Math.min(maxN, Math.max(minN, value + delta));
    const steps = Math.round(next / stepN);
    onChange(Math.round(steps * stepN * 1000) / 1000);
  };

  return (
    <div className="fx-knob">
      <div className="fx-knob__dial-wrap">
        <div className="fx-knob__dial" style={{ "--fill": fill } as React.CSSProperties}>
          <div
            className="fx-knob__indicator"
            style={{ "--angle": `${angle}deg` } as React.CSSProperties}
          />
        </div>
        <input
          type="range"
          className="fx-knob__range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          aria-label={label}
        />
      </div>
      <span className="fx-knob__label">{label}</span>
      <span className="fx-knob__value">{display}</span>
      <div className="fx-knob__nudge">
        <button type="button" className="tooltip" data-tooltip="減らす" onClick={() => nudge(-stepN)}>
          −
        </button>
        <button type="button" className="tooltip" data-tooltip="リセット" onClick={() => onChange(defaultValue)}>
          ↺
        </button>
        <button type="button" className="tooltip" data-tooltip="増やす" onClick={() => nudge(stepN)}>
          +
        </button>
      </div>
    </div>
  );
}
