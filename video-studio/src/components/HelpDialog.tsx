import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  ["Space", "再生 / 一時停止"],
  ["S", "再生位置でクリップ分割"],
  ["M", "選択クリップの音声 ON/OFF"],
  ["Delete", "選択クリップを削除"],
  ["+", "-", "タイムラインの拡大 / 縮小"],
  ["Ctrl+Z", "元に戻す"],
  ["Ctrl+Y", "やり直し"],
  ["?", "このヘルプを表示"],
];

export const HelpDialog = ({ open, onClose }: Props) => {
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onClick={onClose} role="presentation">
      <div
        className="dialog"
        role="dialog"
        aria-labelledby="help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialog__head">
          <h2 id="help-title">ショートカット & ヒント</h2>
          <button type="button" className="dialog__close" onClick={onClose} aria-label="閉じる">
            <X size={18} />
          </button>
        </header>
        <div className="dialog__body">
          <table className="shortcut-table">
            <tbody>
              {shortcuts.map(([key, desc]) => (
                <tr key={key}>
                  <td>
                    <kbd>{key}</kbd>
                  </td>
                  <td>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <section className="dialog__section">
            <h3>音声トラックの見分け方</h3>
            <ul>
              <li>
                <span className="pill pill--linked">動画音</span> … 動画ファイルから自動抽出（Audio 1）
              </li>
              <li>
                <span className="pill pill--daw">DAW</span> … daw-studio のミックス（Audio 2）
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};
