import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { audioEngine } from "./audio/engine";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// ピッチ Worklet を起動直後にプリロード（初回試聴の待ち時間をなくす）
void audioEngine.ensureRunning().catch(() => {
  /* ユーザー操作前は AudioContext が suspend のことがある — 初回再生で再試行 */
});

// PWA: オフライン起動のため本番ビルドでのみ Service Worker を登録
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* 登録失敗は無視（オフライン非対応でも動作する） */
    });
  });
}

