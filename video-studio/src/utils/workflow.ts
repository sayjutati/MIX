import type { EditorState } from "../types";

export type WorkflowStep = 1 | 2 | 3 | 4 | 5;

export const getWorkflowStep = (state: EditorState): WorkflowStep => {
  if (state.assets.length === 0) return 1;
  if (state.clips.length === 0 && state.textClips.length === 0) return 2;
  const hasVideo = state.clips.some((c) => {
    const a = state.assets.find((x) => x.id === c.assetId);
    return a?.kind === "video";
  });
  const hasDaw = state.clips.some((c) => c.origin === "daw");
  if (hasVideo && !hasDaw) return 3;
  if (!hasVideo && state.clips.length > 0) return 4;
  return 5;
};

export const workflowMessages: Record<WorkflowStep, { title: string; body: string }> = {
  1: {
    title: "① 動画・素材を読み込む",
    body: "左の「メディア」または下のボタンから、撮影した動画や画像を追加してください。",
  },
  2: {
    title: "② タイムラインに配置",
    body: "メディア一覧の「タイムラインへ」を押すと、映像と音声（リンク）が自動で並びます。",
  },
  3: {
    title: "③ DAW のミックスを重ねる（任意）",
    body: "daw-studio で作った .daw を読み込むと、BGM/ミックスが Audio 2 に載ります。動画の元音とは別です。",
  },
  4: {
    title: "④ 編集する",
    body: "クリップを選んで音量やテキストを調整。分割はツールバーの「分割」または S キー。",
  },
  5: {
    title: "⑤ 書き出し",
    body: "プレビューで確認したら、形式を MP4 にして「書き出し」。YouTube へそのままアップロードできます。",
  },
};
