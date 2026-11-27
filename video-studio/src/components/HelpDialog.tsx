import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  ["Space / K", "再生 / 一時停止"],
  ["← / →", "1フレームずつ正確に移動（Shift押下で1秒）"],
  ["Home / End", "先頭 / 作品末尾へジャンプ"],
  ["S / Ctrl+B", "再生位置でクリップ分割"],
  ["[ / ]", "選択クリップの先頭 / 末尾を再生位置までトリム"],
  ["Delete / Backspace", "選択クリップを削除"],
  ["Shift + Delete", "削除して後ろのクリップを自動で左へ詰める（リップル削除）"],
  ["M", "選択クリップの音声 ON/OFF"],
  ["Ctrl+D", "選択クリップを複製"],
  ["Ctrl+C / Ctrl+V", "コピー / 再生位置へ貼り付け"],
  ["Ctrl+Z / Ctrl+Y", "元に戻す / やり直し"],
  ["Ctrl + マウスホイール", "カーソル位置基準でタイムライン拡大・縮小"],
  ["Alt + ドラッグ", "一時的にマグネット吸着を無効化して微調整"],
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
          <h2 id="help-title">ショートカット & 操作ガイド</h2>
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
            <h3>プレビュー直接編集</h3>
            <ul>
              <li>映像・画像・テロップを直接クリックして選択、ドラッグで移動（中央自動スナップ付き）</li>
              <li>選択枠の四隅ハンドルをドラッグして直感的に拡大・縮小</li>
              <li>テロップをダブルクリックするとその場でテキストを書き換え可能</li>
            </ul>
          </section>

          <section className="dialog__section">
            <h3>プレビューと書き出しの完全一致</h3>
            <ul>
              <li>WebCodecs 固定フレームレート (CFR) レンダリングにより、フレーム落ちや音ズレなくプレビュー通りの映像・音声を出力します</li>
              <li>選択枠や安全枠ガイドはプレビュー専用オーバーレイのため、書き出し動画には一切写り込みません</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};
