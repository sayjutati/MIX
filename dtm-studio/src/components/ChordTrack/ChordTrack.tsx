import { useCallback, useRef, useState } from "react";
import type { ChordEvent, ChordQuality } from "../../types/project";
import {
  CHORD_PATTERN_LABELS,
  chordName,
  chordsEndBeat,
  diatonicChords,
  presetToChords,
  PROGRESSION_PRESETS,
  ROOT_NAMES,
  type ChordPattern,
  type ChordTarget,
} from "../../utils/chords";
import { ChordPicker, type ChordPickerResult } from "./ChordPicker";

type Props = {
  chords: ChordEvent[];
  beatsVisible: number;
  beatWidth: number;
  playheadBeat: number;
  playing: boolean;
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
  onAddChord: (chord: Omit<ChordEvent, "id">) => void;
  onUpdateChord: (id: string, patch: Partial<ChordEvent>) => void;
  onRemoveChord: (id: string) => void;
  onSetChords: (chords: Omit<ChordEvent, "id">[]) => void;
  onAppendChords: (chords: Omit<ChordEvent, "id">[]) => void;
  onPreviewChord: (root: number, quality: ChordQuality) => void;
  onGenerate: (target: ChordTarget, pattern: ChordPattern) => void;
  onLoopToProgression: () => void;
  onEditStart: () => void;
};

type PickerState =
  | { open: false }
  | { open: true; mode: "new"; startBeat: number }
  | { open: true; mode: "edit"; chordId: string };

type DragState = {
  chordId: string;
  mode: "move" | "resize";
  startX: number;
  origStart: number;
  origDur: number;
  moved: boolean;
  pushed: boolean;
};

const DEFAULT_PICK: ChordPickerResult = { root: 0, quality: "maj", durationBeats: 4 };

export function ChordTrack({
  chords,
  beatsVisible,
  beatWidth,
  playheadBeat,
  playing,
  collapsed,
  onCollapsedChange,
  onAddChord,
  onUpdateChord,
  onRemoveChord,
  onSetChords,
  onAppendChords,
  onPreviewChord,
  onGenerate,
  onLoopToProgression,
  onEditStart,
}: Props) {
  const [keyRoot, setKeyRoot] = useState(0);
  const [sevenths, setSevenths] = useState(false);
  const [pattern, setPattern] = useState<ChordPattern>("block");
  const [presetId, setPresetId] = useState(PROGRESSION_PRESETS[0]!.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState>({ open: false });
  const dragRef = useRef<DragState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const width = beatsVisible * beatWidth;
  const endBeat = chordsEndBeat(chords);
  const selected = chords.find((c) => c.id === selectedId) ?? null;
  const editingChord =
    picker.open && picker.mode === "edit"
      ? chords.find((c) => c.id === picker.chordId) ?? null
      : null;

  /** 追加位置が既存コードと重なる場合は重なりの後ろへずらす */
  const resolveStart = useCallback(
    (start: number, dur: number, ignoreId?: string) => {
      let s = Math.max(0, start);
      let moved = true;
      while (moved) {
        moved = false;
        for (const c of chords) {
          if (c.id === ignoreId) continue;
          if (s < c.startBeat + c.durationBeats && s + dur > c.startBeat) {
            s = c.startBeat + c.durationBeats;
            moved = true;
          }
        }
      }
      return s;
    },
    [chords]
  );

  const openNewPicker = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".chord-block")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const beat = (e.clientX - rect.left) / beatWidth;
    const barStart = Math.max(0, Math.floor(beat / 4) * 4);
    setSelectedId(null);
    setPicker({ open: true, mode: "new", startBeat: barStart });
  };

  const submitPicker = (result: ChordPickerResult) => {
    if (!picker.open) return;
    if (picker.mode === "new") {
      onEditStart();
      const start = resolveStart(picker.startBeat, result.durationBeats);
      onAddChord({
        root: result.root,
        quality: result.quality,
        startBeat: start,
        durationBeats: result.durationBeats,
      });
    } else {
      onEditStart();
      onUpdateChord(picker.chordId, {
        root: result.root,
        quality: result.quality,
        durationBeats: result.durationBeats,
      });
    }
    setPicker({ open: false });
  };

  const addDiatonic = (root: number, quality: ChordQuality) => {
    onPreviewChord(root, quality);
    onEditStart();
    onAddChord({ root, quality, startBeat: endBeat, durationBeats: 4 });
  };

  const insertPreset = () => {
    const preset = PROGRESSION_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onEditStart();
    onAppendChords(presetToChords(preset, keyRoot, endBeat));
  };

  const repeatAll = () => {
    if (chords.length === 0) return;
    onEditStart();
    const span = endBeat;
    onAppendChords(
      [...chords]
        .sort((a, b) => a.startBeat - b.startBeat)
        .map((c) => ({
          root: c.root,
          quality: c.quality,
          startBeat: c.startBeat + span,
          durationBeats: c.durationBeats,
        }))
    );
  };

  const duplicateSelected = () => {
    if (!selected) return;
    onEditStart();
    const start = resolveStart(selected.startBeat + selected.durationBeats, selected.durationBeats);
    onAddChord({
      root: selected.root,
      quality: selected.quality,
      startBeat: start,
      durationBeats: selected.durationBeats,
    });
  };

  const clearAll = () => {
    if (chords.length === 0) return;
    if (!confirm("コード進行をすべて削除しますか？")) return;
    onEditStart();
    onSetChords([]);
    setSelectedId(null);
  };

  const onBlockPointerDown = (e: React.PointerEvent, chord: ChordEvent, mode: "move" | "resize") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelectedId(chord.id);
    dragRef.current = {
      chordId: chord.id,
      mode,
      startX: e.clientX,
      origStart: chord.startBeat,
      origDur: chord.durationBeats,
      moved: false,
      pushed: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onBlockPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dBeat = (e.clientX - d.startX) / beatWidth;
    if (!d.moved && Math.abs(dBeat) < 0.25) return;
    if (!d.pushed) {
      d.pushed = true;
      onEditStart();
    }
    d.moved = true;
    if (d.mode === "move") {
      const next = Math.max(0, Math.round(d.origStart + dBeat));
      onUpdateChord(d.chordId, { startBeat: next });
    } else {
      const next = Math.max(1, Math.round(d.origDur + dBeat));
      onUpdateChord(d.chordId, { durationBeats: next });
    }
  };

  const onBlockPointerUp = (e: React.PointerEvent, chord: ChordEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (d && !d.moved) onPreviewChord(chord.root, chord.quality);
  };

  const diatonic = diatonicChords(keyRoot, sevenths);

  return (
    <div className={`chord-track${collapsed ? " is-collapsed" : ""}`}>
      <div className="chord-track__header">
        <button
          type="button"
          className="chord-track__collapse tooltip"
          data-tooltip={collapsed ? "コード進行を開く" : "コード進行をたたむ"}
          onClick={() => onCollapsedChange(!collapsed)}
        >
          {collapsed ? "▸" : "▾"} コード進行
        </button>

        {!collapsed && (
          <>
            <label className="chord-track__field tooltip" data-tooltip="キー（ダイアトニックとプリセットに反映）">
              キー
              <select value={keyRoot} onChange={(e) => setKeyRoot(Number(e.target.value))}>
                {ROOT_NAMES.map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="chord-track__check tooltip" data-tooltip="ダイアトニックをセブンスコードにする">
              <input type="checkbox" checked={sevenths} onChange={(e) => setSevenths(e.target.checked)} />
              7th
            </label>

            <div className="chord-track__diatonic">
              {diatonic.map((d) => (
                <button
                  key={d.degree}
                  type="button"
                  className="chord-track__chip tooltip"
                  data-tooltip={`${chordName(d.root, d.quality)} を末尾に追加`}
                  onClick={() => addDiatonic(d.root, d.quality)}
                >
                  <span className="chord-track__chip-roman">{d.roman}</span>
                  {chordName(d.root, d.quality)}
                </button>
              ))}
            </div>

            <div className="chord-track__spacer" />

            <select
              className="chord-track__preset tooltip"
              data-tooltip="定番コード進行"
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
            >
              {PROGRESSION_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="button" className="chord-track__btn" onClick={insertPreset}>
              進行を追加
            </button>
          </>
        )}
      </div>

      {!collapsed && (
        <>
          <div className="chord-track__actions">
            <select
              className="chord-track__pattern tooltip"
              data-tooltip="書き出し時の伴奏パターン"
              value={pattern}
              onChange={(e) => setPattern(e.target.value as ChordPattern)}
            >
              {(Object.keys(CHORD_PATTERN_LABELS) as ChordPattern[]).map((p) => (
                <option key={p} value={p}>
                  {CHORD_PATTERN_LABELS[p]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="chord-track__btn chord-track__btn--gen tooltip"
              data-tooltip="ピアノトラックに伴奏を書き出し"
              disabled={chords.length === 0}
              onClick={() => onGenerate("piano", pattern)}
            >
              🎹 ピアノへ
            </button>
            <button
              type="button"
              className="chord-track__btn chord-track__btn--gen tooltip"
              data-tooltip="ギタートラックに伴奏を書き出し"
              disabled={chords.length === 0}
              onClick={() => onGenerate("guitar", pattern)}
            >
              🎸 ギターへ
            </button>
            <span className="chord-track__sep" />
            <button
              type="button"
              className="chord-track__btn tooltip"
              data-tooltip="選択コードを直後に複製"
              disabled={!selected}
              onClick={duplicateSelected}
            >
              複製
            </button>
            <button
              type="button"
              className="chord-track__btn tooltip"
              data-tooltip="進行全体をもう1回繰り返す"
              disabled={chords.length === 0}
              onClick={repeatAll}
            >
              全体リピート
            </button>
            <button
              type="button"
              className="chord-track__btn tooltip"
              data-tooltip="ループ範囲をコード進行に合わせる"
              disabled={chords.length === 0}
              onClick={onLoopToProgression}
            >
              ループ設定
            </button>
            <button
              type="button"
              className="chord-track__btn chord-track__btn--danger"
              disabled={chords.length === 0}
              onClick={clearAll}
            >
              クリア
            </button>
            <span className="chord-track__hint">
              空きをクリックで追加 · ドラッグ移動 · 右端で長さ · 右クリック削除
            </span>
          </div>

          <div className="chord-track__scroll" ref={scrollRef}>
            <div className="chord-track__lane" style={{ width }} onClick={openNewPicker}>
              {Array.from({ length: Math.ceil(beatsVisible / 4) }, (_, i) => (
                <div
                  key={i}
                  className="chord-track__bar-line"
                  style={{ left: i * 4 * beatWidth }}
                />
              ))}
              {chords.map((c) => (
                <div
                  key={c.id}
                  className={`chord-block${c.id === selectedId ? " is-selected" : ""}`}
                  style={{
                    left: c.startBeat * beatWidth,
                    width: Math.max(24, c.durationBeats * beatWidth - 2),
                    background: `linear-gradient(180deg, hsl(${c.root * 30} 60% 46%), hsl(${c.root * 30} 55% 34%))`,
                  }}
                  onPointerDown={(e) => onBlockPointerDown(e, c, "move")}
                  onPointerMove={onBlockPointerMove}
                  onPointerUp={(e) => onBlockPointerUp(e, c)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setPicker({ open: true, mode: "edit", chordId: c.id });
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onEditStart();
                    onRemoveChord(c.id);
                    if (selectedId === c.id) setSelectedId(null);
                  }}
                >
                  <span className="chord-block__name">{chordName(c.root, c.quality)}</span>
                  <span
                    className="chord-block__resize"
                    onPointerDown={(e) => onBlockPointerDown(e, c, "resize")}
                    onPointerMove={onBlockPointerMove}
                    onPointerUp={(e) => onBlockPointerUp(e, c)}
                  />
                </div>
              ))}
              {chords.length === 0 && (
                <p className="chord-track__empty">
                  クリックしてコードを追加、または上のダイアトニック / 定番進行から始める
                </p>
              )}
              <div
                className={`chord-track__playhead${playing ? " is-playing" : ""}`}
                style={{ left: playheadBeat * beatWidth }}
              />
            </div>
          </div>
        </>
      )}

      <ChordPicker
        open={picker.open}
        initial={
          editingChord
            ? {
                root: editingChord.root,
                quality: editingChord.quality,
                durationBeats: editingChord.durationBeats,
              }
            : DEFAULT_PICK
        }
        editing={picker.open && picker.mode === "edit"}
        onPreview={onPreviewChord}
        onSubmit={submitPicker}
        onDelete={
          picker.open && picker.mode === "edit"
            ? () => {
                onEditStart();
                onRemoveChord(picker.chordId);
                setPicker({ open: false });
                setSelectedId(null);
              }
            : undefined
        }
        onClose={() => setPicker({ open: false })}
      />
    </div>
  );
}
