import { useEffect } from "react";

export type ToastKind = "info" | "success" | "error";

export type ToastMessage = {
  id: string;
  text: string;
  kind: ToastKind;
};

interface Props {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastStack = ({ toasts, onDismiss }: Props) => (
  <div className="toast-stack" aria-live="polite">
    {toasts.map((t) => (
      <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
    ))}
  </div>
);

const ToastItem = ({ toast, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) => {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 4200);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className={`toast toast--${toast.kind}`} role="status">
      <span>{toast.text}</span>
      <button type="button" className="toast__close" onClick={onDismiss} aria-label="閉じる">
        ×
      </button>
    </div>
  );
};
