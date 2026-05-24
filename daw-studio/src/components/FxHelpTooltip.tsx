import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Props = {
  title: string;
  description: string;
  children: ReactNode;
};

type Placement = "top" | "bottom";

type Coords = {
  top: number;
  left: number;
  placement: Placement;
  arrowLeft: number;
};

const VIEWPORT_PAD = 10;
const GAP = 8;

const clampPopup = (anchor: DOMRect, popupW: number, popupH: number): Coords => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let placement: Placement = "top";
  let top = anchor.top - popupH - GAP;

  if (top < VIEWPORT_PAD) {
    placement = "bottom";
    top = anchor.bottom + GAP;
  }
  if (placement === "bottom" && top + popupH > vh - VIEWPORT_PAD) {
    placement = "top";
    top = anchor.top - popupH - GAP;
  }
  top = Math.min(Math.max(top, VIEWPORT_PAD), Math.max(VIEWPORT_PAD, vh - VIEWPORT_PAD - popupH));

  let left = anchor.left + anchor.width / 2 - popupW / 2;
  left = Math.min(Math.max(left, VIEWPORT_PAD), Math.max(VIEWPORT_PAD, vw - VIEWPORT_PAD - popupW));

  const anchorCenterX = anchor.left + anchor.width / 2;
  const arrowLeft = Math.min(Math.max(anchorCenterX - left, 14), popupW - 14);

  return { top, left, placement, arrowLeft };
};

/** エフェクトノブ用 — ホバーで機能説明を表示（画面内に収める） */
export function FxHelpTooltip({ title, description, children }: Props) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const popup = popupRef.current;
    if (!anchor || !popup) return;
    const anchorRect = anchor.getBoundingClientRect();
    setCoords(clampPopup(anchorRect, popup.offsetWidth, popup.offsetHeight));
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition, title, description]);

  const show = () => setOpen(true);
  const hide = () => {
    setOpen(false);
    setCoords(null);
  };

  return (
    <>
      <div
        ref={anchorRef}
        className="fx-help-tip"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </div>
      {open &&
        createPortal(
          <div
            ref={popupRef}
            className={`fx-help-tip__popup fx-help-tip__popup--${coords?.placement ?? "top"} fx-help-tip__popup--open`}
            style={
              coords
                ? ({
                    top: coords.top,
                    left: coords.left,
                    "--arrow-left": `${coords.arrowLeft}px`,
                  } as CSSProperties)
                : { top: -9999, left: -9999, visibility: "hidden" }
            }
            role="tooltip"
          >
            <div className="fx-help-tip__title">{title}</div>
            <p className="fx-help-tip__desc">{description}</p>
          </div>,
          document.body
        )}
    </>
  );
}
