import type React from "react";
import { FxHelpTooltip } from "./FxHelpTooltip";

export type EffectSliderProps = {
  label: string;
  min: string;
  max: string;
  step: string;
  value: number;
  onChange: (val: number) => void;
  unit?: string;
  defaultValue?: number;
  formatValue?: (v: number) => string;
  helpTitle?: string;
  helpDescription?: string;
};

export function EffectSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  unit = "",
  defaultValue = 0,
  formatValue,
  helpTitle,
  helpDescription,
}: EffectSliderProps) {
  const minN = parseFloat(min);
  const maxN = parseFloat(max);
  const stepN = parseFloat(step);
  const ratio = (v: number) =>
    maxN === minN ? 0 : Math.min(1, Math.max(0, (v - minN) / (maxN - minN)));
  // 既定値（Pan の C、速度 1.00x 等）を起点に塗る
  const origin = ratio(defaultValue);
  const fill = ratio(value);
  const display = formatValue ? formatValue(value) : `${value}${unit}`;

  const nudge = (delta: number) => {
    const next = Math.min(maxN, Math.max(minN, value + delta));
    const steps = Math.round(next / stepN);
    onChange(Math.round(steps * stepN * 1000) / 1000);
  };

  const slider = (
    <div className="fx-slider">
      <div className="fx-slider__head">
        <span className="fx-slider__label">{label}</span>
        <span className={`fx-slider__value${value !== defaultValue ? " is-changed" : ""}`}>{display}</span>
      </div>
      <div className="fx-slider__row">
        <button type="button" className="fx-slider__btn" aria-label="減らす" onClick={() => nudge(-stepN)}>
          −
        </button>
        <input
          type="range"
          className="fx-slider__range"
          min={min}
          max={max}
          step={step}
          value={value}
          style={
            { "--lo": Math.min(origin, fill), "--hi": Math.max(origin, fill) } as React.CSSProperties
          }
          onChange={(e) => onChange(parseFloat(e.target.value))}
          onDoubleClick={() => onChange(defaultValue)}
          aria-label={label}
        />
        <button type="button" className="fx-slider__btn" aria-label="増やす" onClick={() => nudge(stepN)}>
          +
        </button>
        <button
          type="button"
          className="fx-slider__btn fx-slider__btn--reset"
          aria-label="リセット"
          onClick={() => onChange(defaultValue)}
        >
          ↺
        </button>
      </div>
    </div>
  );

  if (helpTitle && helpDescription) {
    return (
      <FxHelpTooltip title={helpTitle} description={`${helpDescription}（ダブルクリック／↺でリセット）`}>
        {slider}
      </FxHelpTooltip>
    );
  }

  return slider;
}
