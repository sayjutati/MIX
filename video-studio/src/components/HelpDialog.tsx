import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  ["Space", "再生 / 一時停止"],
  ["← / →", "1フレームずつ移動（Shift=1秒）"],
  ["S", "再生位置でクリップ分割"],
  ["M", "選択クリップの音声 ON/OFF"],
  ["Delete", "選択クリップを削除"],
  ["+", "-", "タイムラインの拡大 / 縮小"],
  ["Ctrl+C / Ctrl+V", "クリップのコピー / 貼り付け"],
  ["Ctrl+D", "クリップを複製"],
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
            <h3>テロップ</h3>
            <ul>
              <li>Titles 行ダブルクリック → テキストクリップ追加</li>
              <li>テンプレ（曲名・クレジット・歌詞など）をワンクリック適用</li>
              <li>縁取り / 影 / グラデ / 背景ボックス / 8種フォント</li>
              <li>入り・抜けアニメ（ポップ・スライド・タイプライター・カラオケ）</li>
              <li>横スクロール（流れ続ける）・エンドロール（流れて停止→フェード）</li>
              <li>プレビューをドラッグで位置移動</li>
            </ul>
          </section>
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
