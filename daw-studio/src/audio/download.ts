export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 直後に revoke すると大きいファイルでダウンロードが失敗することがある
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
