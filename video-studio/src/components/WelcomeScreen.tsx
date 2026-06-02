import { Film, FolderOpen, Music2, Sparkles } from "lucide-react";

interface Props {
  onImportMedia: () => void;
  onImportDaw: () => void;
  onOpenProject: () => void;
}

export const WelcomeScreen = ({ onImportMedia, onImportDaw, onOpenProject }: Props) => (
  <div className="welcome">
    <div className="welcome__card">
      <div className="welcome__badge">
        <Sparkles size={18} />
        はじめての方へ
      </div>
      <h2 className="welcome__title">歌ってみた動画、ここから始められます</h2>
      <p className="welcome__lead">
        3ステップで OK：動画を入れる →（必要なら）DAW の音を重ねる → 書き出し。
        難しい設定は後からで大丈夫です。
      </p>
      <ol className="welcome__steps">
        <li>
          <Film size={20} />
          <div>
            <strong>動画・写真を読み込む</strong>
            <span>スマホやカメラの MP4 など</span>
          </div>
        </li>
        <li>
          <Music2 size={20} />
          <div>
            <strong>DAW のミックスを載せる（任意）</strong>
            <span>daw-studio の .daw ファイル</span>
          </div>
        </li>
        <li>
          <strong className="welcome__step-num">③</strong>
          <div>
            <strong>編集して WebM で保存</strong>
            <span>プレビューしながら仕上げ</span>
          </div>
        </li>
      </ol>
      <div className="welcome__actions">
        <button type="button" className="btn btn--primary btn--lg" onClick={onImportMedia}>
          動画・素材を読み込む
        </button>
        <button type="button" className="btn btn--lg" onClick={onImportDaw}>
          DAW プロジェクト (.daw)
        </button>
        <button type="button" className="btn btn--ghost btn--lg" onClick={onOpenProject}>
          <FolderOpen size={16} />
          保存したプロジェクトを開く
        </button>
      </div>
    </div>
  </div>
);
