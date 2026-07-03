import { useEffect, useState } from "react";
import type { ChordQuality } from "../../types/project";
import {
  ALL_QUALITIES,
  chordName,
  QUALITY_LABELS,
  ROOT_NAMES,
} from "../../utils/chords";

export type ChordPickerResult = {
  root: number;
  quality: ChordQuality;
  durationBeats: number;
};

type Props = {
  open: boolean;
  /** 編集時は初期値、新規はデフォルト */
  initial: ChordPickerResult;
  /** 編集モードなら削除ボタンを出す */
  editing: boolean;
  onPreview: (root: number, quality: ChordQuality) => void;
  onSubmit: (result: ChordPickerResult) => void;
  onDelete?: () => void;
  onClose: () => void;
};

const DURATIONS = [
  { beats: 1, label: "1拍" },
  { beats: 2, label: "2拍" },
  { beats: 4, label: "1小節" },
  { beats: 8, label: "2小節" },
];

export function ChordPicker({ open, initial, editing, onPreview, onSubmit, onDelete, onClose }: Props) {
  const [root, setRoot] = useState(initial.root);
  const [quality, setQuality] = useState<ChordQuality>(initial.quality);
  const [durationBeats, setDurationBeats] = useState(initial.durationBeats);

  useEffect(() => {
    if (!open) return;
    setRoot(initial.root);
    setQuality(initial.quality);
    setDurationBeats(initial.durationBeats);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") onSubmit({ root, quality, durationBeats });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onSubmit, root, quality, durationBeats]);

  if (!open) return null;

  const pickRoot = (r: number) => {
    setRoot(r);
    onPreview(r, quality);
  };
  const pickQuality = (q: ChordQuality) => {
    setQuality(q);
    onPreview(root, q);
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="chord-picker" onClick={(e) => e.stopPropagation()} role="dialog">
        <header className="chord-picker__head">
          <h2>
            コードを選択 <span className="chord-picker__current">{chordName(root, quality)}</span>
          </h2>
          <button type="button" className="chord-picker__close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </header>

        <div className="chord-picker__section">ルート音</div>
        <div className="chord-picker__roots">
          {ROOT_NAMES.map((name, i) => (
            <button
              key={name}
              type="button"
              className={`chord-picker__root${i === root ? " is-active" : ""}${name.includes("#") ? " chord-picker__root--sharp" : ""}`}
              onClick={() => pickRoot(i)}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="chord-picker__section">種類</div>
        <div className="chord-picker__qualities">
          {ALL_QUALITIES.map((q) => (
            <button
              key={q}
              type="button"
              className={`chord-picker__quality${q === quality ? " is-active" : ""}`}
              onClick={() => pickQuality(q)}
            >
              {QUALITY_LABELS[q] || "メジャー"}
            </button>
          ))}
        </div>

        <div className="chord-picker__section">長さ</div>
        <div className="chord-picker__durations">
          {DURATIONS.map((d) => (
            <button
              key={d.beats}
              type="button"
              className={`chord-picker__duration${d.beats === durationBeats ? " is-active" : ""}`}
              onClick={() => setDurationBeats(d.beats)}
            >
              {d.label}
            </button>
          ))}
        </div>

        <footer className="chord-picker__foot">
          <button
            type="button"
            className="chord-picker__preview"
            onClick={() => onPreview(root, quality)}
          >
            ♪ 試聴
          </button>
          <div className="chord-picker__foot-right">
            {editing && onDelete && (
              <button type="button" className="chord-picker__delete" onClick={onDelete}>
                削除
              </button>
            )}
            <button
              type="button"
              className="chord-picker__ok"
              onClick={() => onSubmit({ root, quality, durationBeats })}
            >
              {editing ? "更新" : "追加"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
