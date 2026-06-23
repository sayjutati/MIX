import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

type Target = { text: string; rect: DOMRect } | null;
type Pos = { top: number; left: number; placement: "top" | "bottom"; arrow: number };

const PAD = 10;
const GAP = 8;

const closestTip = (el: EventTarget | null): HTMLElement | null => {
  if (!(el instanceof Element)) return null;
  const t = el.closest("[data-tooltip]");
  return t instanceof HTMLElement && t.getAttribute("data-tooltip") ? t : null;
};

export function GlobalTooltip({ enabled }: { enabled: boolean }) {
  const [target, setTarget] = useState<Target>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) {
      setTarget(null);
      return;
    }
    const open = (el: EventTarget | null) => {
      const t = closestTip(el);
      if (t) setTarget({ text: t.getAttribute("data-tooltip")!, rect: t.getBoundingClientRect() });
    };
    const onOver = (e: MouseEvent) => open(e.target);
    const onOut = (e: MouseEvent) => {
      const t = closestTip(e.target);
      const related = closestTip(e.relatedTarget);
      if (t && related !== t) setTarget(null);
    };
    const onFocusIn = (e: FocusEvent) => open(e.target);
    const onFocusOut = () => setTarget(null);
    const dismiss = () => setTarget(null);

    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseout", onOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("mousedown", dismiss, true);
    return () => {
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("mouseout", onOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("mousedown", dismiss, true);
    };
  }, [enabled]);

  useLayoutEffect(() => {
    if (!target || !popupRef.current) {
      setPos(null);
      return;
    }
    const pop = popupRef.current;
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const r = target.rect;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let placement: "top" | "bottom" = "bottom";
    let top = r.bottom + GAP;
    if (top + ph > vh - PAD) {
      placement = "top";
      top = r.top - ph - GAP;
    }
    if (top < PAD) {
      placement = "bottom";
      top = r.bottom + GAP;
    }
    top = Math.min(Math.max(top, PAD), Math.max(PAD, vh - PAD - ph));

    let left = r.left + r.width / 2 - pw / 2;
    left = Math.min(Math.max(left, PAD), Math.max(PAD, vw - PAD - pw));

    const arrow = Math.min(Math.max(r.left + r.width / 2 - left, 12), pw - 12);
    setPos({ top, left, placement, arrow });
  }, [target]);

  if (!enabled || !target) return null;

  return createPortal(
    <div
      ref={popupRef}
      className={`app-tooltip app-tooltip--${pos?.placement ?? "bottom"}`}
      style={
        pos
          ? ({ top: pos.top, left: pos.left, "--arrow-left": `${pos.arrow}px` } as CSSProperties)
          : { top: -9999, left: -9999, visibility: "hidden" }
      }
      role="tooltip"
    >
      {target.text}
    </div>,
    document.body
  );
}
