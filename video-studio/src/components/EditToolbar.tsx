import { Copy, Redo2, Scissors, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import type { EditorApi } from "../hooks/useEditor";
import type { EditorState } from "../types";
import { MAX_PX_PER_SEC, MIN_PX_PER_SEC } from "../types";
import { IconBtn } from "./ui/IconBtn";

interface Props {
  state: EditorState;
  editor: EditorApi;
  isPro: boolean;
}

export const EditToolbar = ({ state, editor, isPro }: Props) => (
  <div className="edit-toolbar">
    <span className="edit-toolbar__group-label">編集</span>
    <IconBtn
      icon={Undo2}
      label="元に戻す (Ctrl+Z)"
      onClick={() => editor.undo()}
      size="sm"
      variant="ghost"
    />
    <IconBtn
      icon={Redo2}
      label="やり直し (Ctrl+Y)"
      onClick={() => editor.redo()}
      size="sm"
      variant="ghost"
    />
    <span className="edit-toolbar__sep" />
    <IconBtn
      icon={Scissors}
      label="再生位置で分割 (S)"
      onClick={() => editor.splitAtPlayhead()}
      size="sm"
    />
    <IconBtn
      icon={Copy}
      label="複製"
      onClick={() => state.selectedClipId && editor.duplicateClip(state.selectedClipId)}
      disabled={!state.selectedClipId}
      size="sm"
      variant="ghost"
    />
    <IconBtn
      icon={Trash2}
      label="削除 (Delete)"
      onClick={() => state.selectedClipId && editor.deleteClip(state.selectedClipId)}
      disabled={!state.selectedClipId}
      size="sm"
      variant="danger"
    />
    <span className="edit-toolbar__sep" />
    <IconBtn
      icon={ZoomOut}
      label="タイムラインを縮小 (-)"
      onClick={() =>
        editor.patch({
          pxPerSec: Math.max(MIN_PX_PER_SEC, state.pxPerSec - 8),
        })
      }
      size="sm"
      variant="ghost"
    />
    <IconBtn
      icon={ZoomIn}
      label="タイムラインを拡大 (+)"
      onClick={() =>
        editor.patch({
          pxPerSec: Math.min(MAX_PX_PER_SEC, state.pxPerSec + 8),
        })
      }
      size="sm"
      variant="ghost"
    />
    {isPro && (
      <>
        <span className="edit-toolbar__sep" />
        <button type="button" className="btn btn--xs" onClick={() => editor.addTrack("video")}>
          ＋映像トラック
        </button>
        <button type="button" className="btn btn--xs" onClick={() => editor.addTrack("audio")}>
          ＋音声トラック
        </button>
      </>
    )}
  </div>
);
