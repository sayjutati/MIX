import { useEffect } from "react";
import type { Instrument } from "../types/project";
import { instrumentEngine } from "../audio/instrumentVoice";
import { previewNote } from "../audio/previewNote";
import { INSTRUMENT_GROUPS, instrumentDisplayName } from "../data/uiLabels";
import type { LaneRole } from "../types/project";
import { kindsForRole, LANE_ROLES } from "../utils/laneRole";

type Props = {
  open: boolean;
  instruments: Instrument[];
  role?: LaneRole | null;
  onPick: (instrumentId: string) => void;
  onClose: () => void;
};

const previewTrack = { pan: 0, volume: 0.9 };

export function InstrumentPicker({ open, instruments, role, onPick, onClose }: Props) {
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
          <h2 id="inst-picker-title">
            {role ? `${LANE_ROLES.find((r) => r.id === role)?.label ?? ""}に楽器を追加` : "楽器を選択"}
          </h2>
          <button type="button" className="inst-picker__close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </header>
        <p className="inst-picker__hint">
          {role
            ? "同じ枠に追加され、既存の楽器と重なって鳴ります。♪ で試聴できます。"
            : "楽器を選ぶと新しいトラックが作成されます。♪ で試聴できます。"}
        </p>
        <div className="inst-picker__body">
          {INSTRUMENT_GROUPS.map((group) =>
            renderGroup(
              group.label,
              instruments.filter((i) => {
                if (!group.kinds.includes(i.kind)) return false;
                if (role) return kindsForRole(role).includes(i.kind);
                return true;
              })
            )
          )}
        </div>
      </div>
    </div>
  );
}
