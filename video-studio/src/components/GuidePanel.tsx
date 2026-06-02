import { CheckCircle2, Circle } from "lucide-react";
import type { EditorState } from "../types";
import { getWorkflowStep, workflowMessages, type WorkflowStep } from "../utils/workflow";

interface Props {
  state: EditorState;
  isPro: boolean;
  onImportMedia: () => void;
  onImportDaw: () => void;
  onFocusMedia: () => void;
}

const steps: WorkflowStep[] = [1, 2, 3, 4, 5];

export const GuidePanel = ({ state, isPro, onImportMedia, onImportDaw, onFocusMedia }: Props) => {
  const current = getWorkflowStep(state);
  const msg = workflowMessages[current];

  return (
    <div className="guide">
      <h3 className="guide__title">作業の流れ</h3>
      <ul className="guide__checklist">
        {steps.map((n) => {
          const done = n < current;
          const active = n === current;
          const m = workflowMessages[n];
          return (
            <li
              key={n}
              className={`guide__step ${done ? "guide__step--done" : ""} ${active ? "guide__step--active" : ""}`}
            >
              {done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
              <div>
                <span className="guide__step-title">{m.title}</span>
                {active && <p className="guide__step-body">{m.body}</p>}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="guide__now card">
        <span className="guide__now-label">いまやること</span>
        <strong>{msg.title}</strong>
        <p>{msg.body}</p>
        <div className="guide__now-actions">
          {current === 1 && (
            <button type="button" className="btn btn--primary btn--sm" onClick={onImportMedia}>
              素材を読み込む
            </button>
          )}
          {current === 2 && (
            <button type="button" className="btn btn--primary btn--sm" onClick={onFocusMedia}>
              メディア一覧へ
            </button>
          )}
          {current === 3 && (
            <button type="button" className="btn btn--sm btn--daw" onClick={onImportDaw}>
              .daw を読み込む
            </button>
          )}
        </div>
      </div>

      <details className="guide__tips" open={!isPro}>
        <summary>音声の仕組み（重要）</summary>
        <ul>
          <li>
            <strong>動画の音</strong> … Audio 1 に「動画から抽出」として載ります（映像トラックは無音）。
          </li>
          <li>
            <strong>DAW の音</strong> … Audio 2 に別クリップ。動画の元音とは混ざりません。
          </li>
          <li>🔊 / M / S でクリップ・トラックごとにオンオフできます。</li>
        </ul>
      </details>

      {isPro && (
        <details className="guide__tips">
          <summary>やり込みヒント</summary>
          <ul>
            <li>リンク解除で映像と音声を別々に編集</li>
            <li>インスペクター「映像FX」でフィルタ・トランジション</li>
            <li>ループ A/B で同じ区間を繰り返し確認</li>
            <li>? キーでショートカット一覧</li>
          </ul>
        </details>
      )}
    </div>
  );
};
