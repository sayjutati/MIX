// 同一 URL の同時ロードで onload を上書きして Promise が永久に解決しなくなるのを避けるため Promise 自体をキャッシュする
const imageCache = new Map<string, Promise<HTMLImageElement>>();

export const loadImage = (url: string): Promise<HTMLImageElement> => {
  const hit = imageCache.get(url);
  if (hit) return hit;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      imageCache.delete(url);
      reject(new Error("画像の読み込みに失敗しました"));
    };
    img.src = url;
  });
  imageCache.set(url, p);
  return p;
};

export const invalidateImage = (url: string) => imageCache.delete(url);
