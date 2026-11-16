import { Mic, Music } from "lucide-react";

export function EmptyWorkspace() {
  return (
    <div
      className="workspace-empty"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
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
      <p className="workspace-empty__hint">
        ヒント: オケを入れてから録音。自分の声の跳ね返りはモニターOFFのままが安全です。録音時にソフト側でノイズを落とします。
      </p>
    </div>
  );
}
