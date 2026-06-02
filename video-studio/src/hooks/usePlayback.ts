import { useEffect } from "react";
import { playbackEngine } from "../audio/playbackEngine";
import type { EditorState } from "../types";

/** プレビュー音声を EditorState に同期 */
export const usePlayback = (state: EditorState) => {
  useEffect(() => {
    playbackEngine.sync(state);
  }, [state]);

  useEffect(() => {
    if (!state.isPlaying) playbackEngine.stopAll();
  }, [state.isPlaying]);

  useEffect(
    () => () => playbackEngine.dispose(),
    []
  );
};
