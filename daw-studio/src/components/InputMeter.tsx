import { useEffect, useRef } from "react";
import { audioEngine } from "../audio/engine";

/** マイク入力レベル + ライブ波形（録音前・録音中） */
export function InputMeter({ live }: { live: boolean }) {
  const fillRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dbRef = useRef<HTMLSpanElement>(null);
  const peakRef = useRef(0);
  const waveBuf = useRef(new Float32Array(256));

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const level = live ? audioEngine.getInputLevel() : 0;
      peakRef.current = Math.max(level, peakRef.current * 0.88);
      const pct = Math.min(100, peakRef.current * 160);
      if (fillRef.current) {
        fillRef.current.style.width = `${pct}%`;
        fillRef.current.style.background =
          pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#22c55e";
      }
      if (dbRef.current) {
        const db = peakRef.current > 0.0001 ? Math.round(20 * Math.log10(peakRef.current)) : -60;
        dbRef.current.textContent = live ? `${db}dB` : "—";
      }

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(0, 0, w, h);
        ctx.beginPath();
        ctx.strokeStyle = pct > 90 ? "#ef4444" : live ? "#22c55e" : "#4b5563";
        ctx.lineWidth = 1.5;
        const buf = waveBuf.current;
        const ok = live && audioEngine.copyInputWaveform(buf);
        if (ok) {
          for (let i = 0; i < buf.length; i++) {
            const x = (i / (buf.length - 1)) * w;
            const y = h / 2 - buf[i]! * (h * 0.46);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        } else {
          ctx.moveTo(0, h / 2);
          ctx.lineTo(w, h / 2);
        }
        ctx.stroke();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [live]);

  return (
    <div
      className={`input-meter tooltip ${live ? "input-meter--live" : ""}`}
      data-tooltip={
        live
          ? "マイク入力（緑=適正 / 黄=大きめ / 赤=割れ）"
          : "録音を開始すると入力レベルと波形が表示されます"
      }
    >
      <span className="input-meter__icon">MIC</span>
      <canvas ref={canvasRef} className="input-meter__wave" width={96} height={28} />
      <div className="input-meter__track">
        <div ref={fillRef} className="input-meter__fill" />
      </div>
      <span ref={dbRef} className="input-meter__db">
        —
      </span>
    </div>
  );
}
