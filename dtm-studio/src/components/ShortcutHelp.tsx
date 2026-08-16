type Props = {
  open: boolean;
  onClose: () => void;
};

const SECTIONS = [
  {
    title: "再生",
    items: [
      ["Space", "再生 / 停止"],
      ["L", "ループ ON/OFF"],
      ["M", "メトロノーム"],
      ["R", "録音（オーディオトラック）"],
    ],
  },
  {
    title: "編集",
    items: [
      ["Ctrl+Z / Ctrl+Y", "元に戻す / やり直し"],
      ["Ctrl+C / V / D", "コピー / 貼付 / 複製"],
      ["Ctrl+A", "全選択"],
      ["Ctrl+Shift+←/→", "選択メロディの長さを伸縮"],
      ["Ctrl+ドラッグ", "グリッドに音符を連続配置"],
      ["Delete", "選択削除"],
      ["1 / 2", "選択ツール / 描画ツール"],
      ["矢印", "ノート移動"],
      ["Shift+↑↓", "半音移調"],
    ],
  },
  {
    title: "入力",
    items: [
      ["A〜K 行", "PC 鍵盤で試聴・打ち込み"],
      ["ドラッグ", "ファイルをドロップで取込"],
    ],
  },
];

export function ShortcutHelp({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="shortcut-help"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="shortcut-help-title"
      >
        <header className="shortcut-help__head">
          <h2 id="shortcut-help-title">キーボードショートカット</h2>
          <button type="button" className="shortcut-help__close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </header>
        <div className="shortcut-help__body">
          {SECTIONS.map((sec) => (
            <section key={sec.title}>
              <h3>{sec.title}</h3>
              <dl>
                {sec.items.map(([key, desc]) => (
                  <div key={key} className="shortcut-help__row">
                    <dt>{key}</dt>
                    <dd>{desc}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
