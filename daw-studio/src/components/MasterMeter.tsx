import { useEffect, useRef } from "react";
import { audioEngine } from "../audio/engine";

/** マスター出力のレベルメーター（dBスケール風の簡易ピーク表示） */
export function MasterMeter() {
  const fillRef = useRef<HTMLDivElement>(null);
  const peakRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const level = audioEngine.getLevel();
      // ピークを滑らかに減衰させる
      peakRef.current = Math.max(level, peakRef.current * 0.92);
      const pct = Math.min(100, peakRef.current * 130);
      if (fillRef.current) {
        fillRef.current.style.width = `${pct}%`;
        fillRef.current.style.background =
          pct > 88 ? "#ef4444" : pct > 65 ? "#f59e0b" : "#22c55e";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="master-meter tooltip" data-tooltip="出力レベル（緑→黄→赤で音割れ注意）">
      <div ref={fillRef} className="master-meter__fill" />
    </div>
  );
}
