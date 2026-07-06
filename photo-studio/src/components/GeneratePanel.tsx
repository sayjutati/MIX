import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { GENERATION_PROVIDERS } from "../generate/generationService";
import { usePhotoStore } from "../state/usePhotoStore";
import type { GenerateParams } from "../types/document";
import { hashPrompt } from "../canvas/pixelOps";

type Props = {
  onError?: (msg: string) => void;
};

export const GeneratePanel = ({ onError }: Props) => {
  const project = usePhotoStore((s) => s.project);
  const generating = usePhotoStore((s) => s.generating);
  const generateImage = usePhotoStore((s) => s.generateImage);

  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<GenerateParams["style"]>("illustration");
  const [seed, setSeed] = useState(0);
  const [useSeed, setUseSeed] = useState(false);

  const provider = GENERATION_PROVIDERS[0]!;

  const submit = async () => {
    try {
      await generateImage({
        prompt: prompt.trim(),
        width: project.width,
        height: project.height,
        style,
        seed: useSeed ? seed : hashPrompt(prompt),
      });
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "生成に失敗しました");
    }
  };

  return (
    <div className="panel">
      <h2 className="panel__title">画像を生成</h2>
      <p className="panel__hint">
        プロンプトを入力して生成します。現在は <strong>{provider.name}</strong>（{provider.description}）
      </p>

      <label className="field">
        プロンプト
        <textarea
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="例: 夕焼けの海辺、歌ってみたサムネ、幻想的な紫の空…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit();
          }}
        />
      </label>

      <label className="field">
        スタイル
        <select value={style} onChange={(e) => setStyle(e.target.value as GenerateParams["style"])}>
          <option value="illustration">イラスト</option>
          <option value="anime">アニメ</option>
          <option value="photo">フォト風</option>
          <option value="abstract">抽象</option>
        </select>
      </label>

      <p className="panel__meta">
        出力サイズ: {project.width} × {project.height}
      </p>

      <label className="field field--check">
        <input type="checkbox" checked={useSeed} onChange={(e) => setUseSeed(e.target.checked)} />
        シード値を固定
      </label>
      {useSeed && (
        <label className="field">
          シード
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
        </label>
      )}

      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={generating || !prompt.trim()}
        onClick={() => void submit()}
      >
        {generating ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
        {generating ? "生成中…" : "生成する"}
      </button>
      <p className="panel__hint">Ctrl+Enter で生成</p>
    </div>
  );
};
