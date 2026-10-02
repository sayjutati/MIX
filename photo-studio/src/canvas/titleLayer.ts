/** Canva 風のタイトル文字を透明 PNG として焼く（サムネ用） */
export const renderTitlePng = (text: string, width: number, height: number): Promise<Blob> => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("canvas 2d unavailable"));

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (!lines.length) return Promise.reject(new Error("文字を入力してください"));

  const size = Math.max(28, Math.round(height * (lines.length > 2 ? 0.07 : 0.1)));
  ctx.font = `800 ${size}px "M PLUS 1", "Hiragino Sans", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(8, size * 0.14);
  ctx.strokeStyle = "#111827";
  ctx.fillStyle = "#ffffff";

  const lh = size * 1.28;
  const y0 = height / 2 - ((lines.length - 1) * lh) / 2;
  for (let i = 0; i < lines.length; i++) {
    const y = y0 + i * lh;
    ctx.strokeText(lines[i]!, width / 2, y);
    ctx.fillText(lines[i]!, width / 2, y);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("書き出しに失敗しました"))), "image/png");
  });
};
