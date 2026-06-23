import type { Project } from "../../types/project";

type Props = {
  open: boolean;
  currentId: string;
  projects: Project[];
  loading: boolean;
  onClose: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
};

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function ProjectBrowser({
  open,
  currentId,
  projects,
  loading,
  onClose,
  onOpen,
  onDelete,
}: Props) {
  if (!open) return null;

  return (
    <div className="project-modal" role="dialog" aria-modal="true" aria-label="プロジェクト一覧">
      <button type="button" className="project-modal__backdrop" onClick={onClose} aria-label="閉じる" />
      <div className="project-modal__panel">
        <header className="project-modal__header">
          <h2>プロジェクト</h2>
          <button type="button" className="project-modal__close" onClick={onClose}>
            ✕
          </button>
        </header>
        {loading ? (
          <p className="project-modal__empty">読み込み中…</p>
        ) : projects.length === 0 ? (
          <p className="project-modal__empty">保存済みプロジェクトはありません</p>
        ) : (
          <ul className="project-modal__list">
            {[...projects]
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((p) => (
                <li key={p.id} className={p.id === currentId ? "project-modal__item--current" : ""}>
                  <button type="button" className="project-modal__open" onClick={() => onOpen(p.id)}>
                    <span className="project-modal__name">{p.name}</span>
                    <span className="project-modal__meta">
                      {p.tracks.length} トラック · {fmtDate(p.updatedAt)}
                      {p.id === currentId ? " · 編集中" : ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="project-modal__delete"
                    onClick={() => onDelete(p.id)}
                    aria-label={`${p.name} を削除`}
                  >
                    削除
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
