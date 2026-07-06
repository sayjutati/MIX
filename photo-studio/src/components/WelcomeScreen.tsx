import { ImagePlus, Sparkles, Upload } from "lucide-react";
import { CANVAS_PRESETS } from "../types/document";

type Props = {
  onNew: (w: number, h: number) => void;
  onImport: () => void;
  onStartGenerate: () => void;
};

export const WelcomeScreen = ({ onNew, onImport, onStartGenerate }: Props) => (
  <div className="welcome">
    <div className="welcome__hero">
      <Sparkles size={40} className="welcome__icon" />
      <h1 className="welcome__title">MIX Photo</h1>
      <p className="welcome__lead">
        ブラウザ完結の画像生成・編集スタジオ。
        プロンプトから生成するか、画像を読み込んでレイヤー編集できます。
      </p>
    </div>

    <div className="welcome__actions">
      <button type="button" className="welcome__card" onClick={onStartGenerate}>
        <Sparkles size={24} />
        <strong>画像を生成</strong>
        <span>プロンプトから新規作成</span>
      </button>
      <button type="button" className="welcome__card" onClick={onImport}>
        <Upload size={24} />
        <strong>画像を読み込む</strong>
        <span>PNG / JPEG / WebP</span>
      </button>
      <button
        type="button"
        className="welcome__card"
        onClick={() => onNew(1920, 1080)}
      >
        <ImagePlus size={24} />
        <strong>空のキャンバス</strong>
        <span>1920 × 1080</span>
      </button>
    </div>

    <div className="welcome__presets">
      <p className="welcome__presets-label">キャンバスサイズ</p>
      <div className="welcome__preset-grid">
        {CANVAS_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="welcome__preset"
            onClick={() => onNew(p.width, p.height)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  </div>
);
