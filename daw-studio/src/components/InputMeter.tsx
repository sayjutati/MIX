import { useEffect, useRef } from "react";
import { audioEngine } from "../audio/engine";

/** マイク入力のレベルメーター（録音中に表示） */
export function InputMeter() {
  const fillRef = useRef<HTMLDivElement>(null);
  const peakRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const level = audioEngine.getInputLevel();
      peakRef.current = Math.max(level, peakRef.current * 0.9);
      const pct = Math.min(100, peakRef.current * 130);
      if (fillRef.current) {
        fillRef.current.style.width = `${pct}%`;
        fillRef.current.style.background =
          pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#22c55e";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="input-meter tooltip" data-tooltip="マイク入力レベル（赤は大きすぎ）">
      <span className="input-meter__icon">MIC</span>
      <div className="input-meter__track">
        <div ref={fillRef} className="input-meter__fill" />
      </div>
    </div>
  );
}
