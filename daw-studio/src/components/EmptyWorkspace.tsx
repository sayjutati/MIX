import { Mic, Music } from "lucide-react";

type Props = {
  onImport: () => void;
  onRecord: () => void;
  hasBgm: boolean;
};

export function EmptyWorkspace({ onImport, onRecord, hasBgm }: Props) {
  return (
    <div className="workspace-empty">
      <h2 className="workspace-empty__title">ブラウザ完結 DAW — 歌ってみた制作</h2>
      <p className="workspace-empty__lead">
        端末の音源を読み込み、再生しながらマイクで重ね録り。ミックスして WAV で書き出しまで、この画面だけで完結します。
      </p>
      <ol className="workspace-empty__steps">
        <li>
          <Music size={18} />
          <span>
            <strong>BGM / 音源を追加</strong> — PC内の MP3・WAV などをプロジェクトへ
          </span>
        </li>
        <li>
          <Mic size={18} />
          <span>
            <strong>オーバーダビ録音</strong> — オケを再生しながら歌や楽器を重ね録り
          </span>
        </li>
        <li>
          <span className="workspace-empty__step-num">3</span>
          <span>
            <strong>FX・タイミング調整</strong> — エフェクトとクリップ位置を合わせてミックス
          </span>
        </li>
        <li>
          <span className="workspace-empty__step-num">4</span>
          <span>
            <strong>書き出し</strong> — 全トラックを統合して完成ファイルをダウンロード
          </span>
        </li>
      </ol>
      <div className="workspace-empty__actions">
        <button type="button" className="btn btn--primary" onClick={onImport}>
          <Music size={18} /> BGM / 音源を追加
        </button>
        <button
          type="button"
          className="btn btn--record"
          onClick={onRecord}
          title={hasBgm ? "BGMに合わせて録音" : "先にBGMを追加するとオケに合わせて録音できます"}
        >
          <Mic size={18} /> {hasBgm ? "オーバーダビ録音" : "録音（単独）"}
        </button>
      </div>
      {!hasBgm && (
        <p className="workspace-empty__hint">ヒント: インスト音源を追加してから録音すると、オケに合わせた重ね録りができます。</p>
      )}
    </div>
  );
}
