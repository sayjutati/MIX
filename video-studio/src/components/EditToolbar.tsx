import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Copy,
  Film,
  FoldHorizontal,
  Image,
  Magnet,
  Maximize2,
  Mic,
  Music,
  Redo2,
  Scissors,
  Square,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useRef, useState } from "react";
import type { EditorApi } from "../hooks/useEditor";
import type { EditorState } from "../types";

interface Props {
  state: EditorState;
  editor: EditorApi;
  onStatus: (msg: string) => void;
  onFitZoom: () => void;
}

export const EditToolbar = ({ state, editor, onStatus, onFitZoom }: Props) => {
  const [voRec, setVoRec] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const voStartPlayheadRef = useRef<number>(0);

  const toggleVoiceover = async () => {
    if (voRec && recRef.current && recRef.current.state !== "inactive") {
      recRef.current.stop();
      return;
    }
    try {
      voStartPlayheadRef.current = state.playhead;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recRef.current = null;
        setVoRec(false);
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 200) {
          onStatus("録音が短すぎます");
          return;
        }
        const ext = blob.type.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `voiceover-${Date.now()}.${ext}`, {
          type: blob.type || "audio/webm",
        });
        void editor
          .importAudioOntoTrack(file, "a1", "media", voStartPlayheadRef.current)
          .then(() => onStatus("ナレーションをタイムラインに追加しました"))
          .catch(() => onStatus("録音の配置に失敗しました"));
      };
      rec.start(200);
      recRef.current = rec;
      setVoRec(true);
      onStatus("ナレーション録音中… もう一度押すと現在の再生位置へ配置します");
    } catch {
      setVoRec(false);
      onStatus("マイクを開始できませんでした");
    }
  };

  const hasSelection = Boolean(state.selectedClipId);

  return (
    <div className="edit-toolbar">
      <div className="edit-toolbar__group">
        <button
          type="button"
          className="tool-btn"
          disabled={!editor.canUndo}
          onClick={() => editor.undo()}
          title="元に戻す (Ctrl+Z)"
        >
          <Undo2 size={14} />
        </button>
        <button
          type="button"
          className="tool-btn"
          disabled={!editor.canRedo}
          onClick={() => editor.redo()}
          title="やり直し (Ctrl+Y / Ctrl+Shift+Z)"
        >
          <Redo2 size={14} />
        </button>
      </div>

      <span className="edit-toolbar__sep" />

      <div className="edit-toolbar__group">
        <button
          type="button"
          className="tool-btn tool-btn--primary"
          onClick={() => editor.splitAtPlayhead()}
          title="再生位置で分割 (S / Ctrl+B)"
        >
          <Scissors size={14} />
          <span>分割</span>
        </button>
        <button
          type="button"
          className="tool-btn"
          disabled={!hasSelection}
          onClick={() => editor.trimToPlayhead("start")}
          title="選択クリップの先頭を再生位置までカット ([)"
        >
          <ArrowLeftToLine size={14} />
        </button>
        <button
          type="button"
          className="tool-btn"
          disabled={!hasSelection}
          onClick={() => editor.trimToPlayhead("end")}
          title="選択クリップの末尾を再生位置までカット (])"
        >
          <ArrowRightToLine size={14} />
        </button>
        <button
          type="button"
          className="tool-btn"
          disabled={!hasSelection}
          onClick={() => editor.duplicateSelected()}
          title="選択クリップを複製 (Ctrl+D)"
        >
          <Copy size={14} />
        </button>
        <button
          type="button"
          className="tool-btn tool-btn--danger"
          disabled={!hasSelection}
          onClick={() => editor.deleteClip()}
          title="削除 (Delete) / Shift+Deleteで後ろを詰めて削除"
        >
          <Trash2 size={14} />
        </button>
        <button
          type="button"
          className="tool-btn"
          onClick={() => {
            editor.closeGaps(state.selectedTrackId ?? undefined);
            onStatus("クリップ間の隙間を詰めました");
          }}
          title="選択トラックの隙間を一括で詰める"
        >
          <FoldHorizontal size={14} />
          <span>隙間詰め</span>
        </button>
      </div>

      <span className="edit-toolbar__sep" />

      <div className="edit-toolbar__group">
        <button
          type="button"
          className={`tool-btn ${state.rippleMode ? "tool-btn--active" : ""}`}
          onClick={() => editor.patch({ rippleMode: !state.rippleMode })}
          title="リップル削除モード（削除時に後ろのクリップを自動で左へ詰める）"
        >
          <span>自動詰め</span>
        </button>
        <button
          type="button"
          className={`tool-btn ${state.snapEnabled ? "tool-btn--active" : ""}`}
          onClick={() => editor.patch({ snapEnabled: !state.snapEnabled })}
          title="マグネット吸着（再生ヘッド・他クリップ端へピタッと吸着 / Altドラッグで一時解除）"
        >
          <Magnet size={14} />
          <span>吸着</span>
        </button>
        <button
          type="button"
          className={`tool-btn ${voRec ? "tool-btn--rec" : ""}`}
          onClick={() => void toggleVoiceover()}
          title="マイクでアフレコ録音"
        >
          {voRec ? <Square size={13} /> : <Mic size={14} />}
          <span>{voRec ? "録音停止" : "アフレコ"}</span>
        </button>
      </div>

      <span className="edit-toolbar__sep" />

      <div className="edit-toolbar__group">
        <button
          type="button"
          className="tool-btn"
          onClick={() => editor.addTrack("video")}
          title="映像トラックを追加"
        >
          <Film size={13} />
          <span>+映像</span>
        </button>
        <button
          type="button"
          className="tool-btn"
          onClick={() => editor.addTrack("audio")}
          title="音声トラックを追加"
        >
          <Music size={13} />
          <span>+音</span>
        </button>
        <button
          type="button"
          className="tool-btn"
          onClick={() => editor.addTextClip()}
          title="再生位置にテロップを追加"
        >
          <Type size={13} />
          <span>+文字</span>
        </button>
        <button
          type="button"
          className="tool-btn"
          onClick={() => editor.addTrack("overlay")}
          title="画像オーバーレイトラックを追加"
        >
          <Image size={13} />
          <span>+画像枠</span>
        </button>
      </div>

      <div className="edit-toolbar__spacer" />

      <div className="edit-toolbar__zoom">
        <button
          type="button"
          className="tool-btn"
          onClick={() => editor.patch({ pxPerSec: Math.max(8, Math.round(state.pxPerSec / 1.3)) })}
          title="タイムライン縮小"
        >
          <ZoomOut size={14} />
        </button>
        <input
          type="range"
          min={8}
          max={240}
          step={2}
          value={state.pxPerSec}
          onChange={(e) => editor.patch({ pxPerSec: Number(e.target.value) })}
          aria-label="タイムラインズーム"
          title="タイムライン拡大率 (Ctrl + マウスホイールでも拡縮)"
        />
        <button
          type="button"
          className="tool-btn"
          onClick={() => editor.patch({ pxPerSec: Math.min(240, Math.round(state.pxPerSec * 1.3)) })}
          title="タイムライン拡大"
        >
          <ZoomIn size={14} />
        </button>
        <button
          type="button"
          className="tool-btn"
          onClick={onFitZoom}
          title="作品全体が画面幅に収まるようフィット"
        >
          <Maximize2 size={13} />
          <span>全体</span>
        </button>
      </div>
    </div>
  );
};
