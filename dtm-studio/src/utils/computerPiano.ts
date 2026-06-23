/** FL Studio / 一般的 Web DTM 風の PC キーボード → MIDI */
export const COMPUTER_PIANO_MAP: Record<string, number> = {
  KeyZ: 48,
  KeyS: 49,
  KeyX: 50,
  KeyD: 51,
  KeyC: 52,
  KeyV: 53,
  KeyG: 54,
  KeyB: 55,
  KeyH: 56,
  KeyN: 57,
  KeyJ: 58,
  KeyM: 59,
  KeyQ: 60,
  Key2: 61,
  KeyW: 62,
  Key3: 63,
  KeyE: 64,
  KeyR: 65,
  Key5: 66,
  KeyT: 67,
  Key6: 68,
  KeyY: 69,
  Key7: 70,
  KeyU: 71,
  KeyI: 72,
};

export const pitchFromComputerKey = (code: string): number | null =>
  COMPUTER_PIANO_MAP[code] ?? null;
