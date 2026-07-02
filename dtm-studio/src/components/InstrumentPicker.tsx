import { useEffect } from "react";
import type { Instrument } from "../types/project";
import { instrumentEngine } from "../audio/instrumentVoice";
import { previewNote } from "../audio/previewNote";
import { INSTRUMENT_GROUPS, instrumentDisplayName } from "../data/uiLabels";

type Props = {
  open: boolean;
  instruments: Instrument[];
  onPick: (instrumentId: string) => void;
  onClose: () => void;
};

const previewTrack = { pan: 0, volume: 0.9 };

export function InstrumentPicker({ open, instruments, onPick, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const preview = (inst: Instrument) => {
    const pitch =
      instrumentEngine(inst) === "drum"
        ? 38
        : inst.kind === "bass" || inst.kind === "bass808"
          ? 45
          : 60;
    void previewNote(pitch, 100, inst, previewTrack);
  };

  const renderGroup = (label: string, items: Instrument[]) =>
    items.length > 0 && (
      <section className="inst-picker__group" key={label}>
        <h3>{label}</h3>
        <div className="inst-picker__grid">
          {items.map((inst) => (
            <div key={inst.id} className="inst-picker__card">
              <button
                type="button"
                className="inst-picker__pick"
                onClick={() => onPick(inst.id)}
              >
                <span className="inst-picker__name">
                  {instrumentDisplayName(inst.kind, inst.name)}
                </span>
                <span className="inst-picker__kind">
                  {instrumentEngine(inst) === "drum" ? "リズム" : "シンセ"}
                </span>
              </button>
              <button
                type="button"
                className="inst-picker__preview tooltip"
                data-tooltip="音を試聴"
                onClick={(e) => {
                  e.stopPropagation();
                  preview(inst);
                }}
                aria-label={`${inst.name} を試聴`}
              >
                ♪
              </button>
            </div>
          ))}
        </div>
      </section>
    );

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="inst-picker"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="inst-picker-title"
      >
        <header className="inst-picker__head">
          <h2 id="inst-picker-title">楽器を選択</h2>
          <button type="button" className="inst-picker__close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </header>
        <p className="inst-picker__hint">楽器を選ぶと新しいトラックが作成されます。♪ で試聴できます。</p>
        <div className="inst-picker__body">
          {INSTRUMENT_GROUPS.map((group) =>
            renderGroup(
              group.label,
              instruments.filter((i) => group.kinds.includes(i.kind))
            )
          )}
        </div>
      </div>
    </div>
  );
}
