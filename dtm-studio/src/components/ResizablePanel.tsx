import { useCallback, useEffect, useRef } from "react";

type Props = {
  side: "left" | "right";
  width: number;
  min?: number;
  max?: number;
  onWidthChange: (w: number) => void;
};

export function ResizablePanel({ side, width, min = 160, max = 420, onWidthChange }: Props) {
  const dragging = useRef(false);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      const startX = e.clientX;
      const startW = width;

      const onMove = (ev: MouseEvent) => {
        const dx = side === "left" ? ev.clientX - startX : startX - ev.clientX;
        onWidthChange(Math.max(min, Math.min(max, startW + dx)));
      };
      const onUp = () => {
        dragging.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [side, width, min, max, onWidthChange]
  );

  useEffect(
    () => () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    },
    []
  );

  return (
    <div
      className={`panel-resizer panel-resizer--${side}${dragging.current ? " is-dragging" : ""}`}
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="パネル幅を調整"
    />
  );
}
