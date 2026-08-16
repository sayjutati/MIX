import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { usePhotoStore } from "../state/usePhotoStore";
import type { GenerateParams } from "../types/document";
import { hashPrompt } from "../canvas/pixelOps";

type Props = {
  onError?: (msg: string) => void;
};

const STYLES: { id: GenerateParams["style"]; label: string }[] = [
  { id: "illustration", label: "イラスト" },
  { id: "anime", label: "アニメ" },
  { id: "photo", label: "フォト" },
  { id: "abstract", label: "抽象" },
];

export const GeneratePanel = ({ onError }: Props) => {
  const project = usePhotoStore((s) => s.project);
  const generating = usePhotoStore((s) => s.generating);
  const generateImage = usePhotoStore((s) => s.generateImage);

  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<GenerateParams["style"]>("illustration");
  const [seed, setSeed] = useState(0);
  const [useSeed, setUseSeed] = useState(false);

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
      <p className="panel__hint">雰囲気の単語を入れると色と構図が変わります（夕焼け・海・夜・サムネ など）</p>

      <label className="field">
        プロンプト
        <textarea
          rows={5}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="例: 夕焼けの海辺、歌ってみたサムネ"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit();
          }}
        />
      </label>

      <div className="style-chips">
        {STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`style-chips__btn ${style === s.id ? "is-on" : ""}`}
            onClick={() => setStyle(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className="panel__meta">{project.width} × {project.height}</p>

      <label className="field field--check">
        <input type="checkbox" checked={useSeed} onChange={(e) => setUseSeed(e.target.checked)} />
        シード固定
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
    </div>
  );
};
