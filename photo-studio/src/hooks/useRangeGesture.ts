import type { ChangeEvent, PointerEvent } from "react";
import { usePhotoStore } from "../state/usePhotoStore";

/** スライダー: 1 ドラッグ = 1 Undo */
export const useRangeGesture = (onChange: (value: number) => void) => {
  const beginGesture = usePhotoStore((s) => s.beginGesture);
  const endGesture = usePhotoStore((s) => s.endGesture);

  const finish = (e: PointerEvent<HTMLInputElement>) => {
    onChange(Number(e.currentTarget.value));
    endGesture();
  };

  return {
    onPointerDown: () => beginGesture(),
    onChange: (e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value)),
    onPointerUp: finish,
  };
};
