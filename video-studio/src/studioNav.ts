export type StudioId = "home" | "dtm" | "daw" | "video" | "photo";

const PORTS: Record<Exclude<StudioId, "home">, number> = {
  dtm: 1440,
  daw: 1420,
  video: 1430,
  photo: 1450,
};

const inPortal = () => /\/(dtm|daw|video|photo)(\/|$)/.test(location.pathname);

/** ポータル配下なら相対パス、単体 dev なら各アプリのポート */
export const studioHref = (id: StudioId): string => {
  if (id === "home") return inPortal() ? "/" : "/";
  if (inPortal()) return `/${id}/`;
  return `http://127.0.0.1:${PORTS[id]}/`;
};

export const STUDIOS: { id: Exclude<StudioId, "home">; label: string }[] = [
  { id: "dtm", label: "DTM" },
  { id: "daw", label: "DAW" },
  { id: "video", label: "Video" },
  { id: "photo", label: "Photo" },
];
