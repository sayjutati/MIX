import { useCallback, useEffect, useState } from "react";
import type { ExportFormat } from "../export/exportCapabilities";

export type UiMode = "beginner" | "pro";
export type SidebarTab = "media" | "guide";
export type InspectorTab = "basic" | "fx" | "project";

const KEY = "mix-video-studio-ui";

interface UiPrefs {
  mode: UiMode;
  sidebarTab: SidebarTab;
  inspectorTab: InspectorTab;
  mixerOpen: boolean;
  helpOpen: boolean;
  /** 書き出し形式（既定 MP4 = YouTube 向け） */
  exportFormat: ExportFormat;
}

const defaults: UiPrefs = {
  mode: "beginner",
  sidebarTab: "guide",
  inspectorTab: "basic",
  mixerOpen: true,
  helpOpen: false,
  exportFormat: "mp4",
};

const load = (): UiPrefs => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
};

export const useUiPrefs = () => {
  const [prefs, setPrefs] = useState<UiPrefs>(load);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  }, [prefs]);

  const setMode = useCallback((mode: UiMode) => {
    setPrefs((p) => ({
      ...p,
      mode,
      sidebarTab: mode === "beginner" ? "guide" : p.sidebarTab,
      mixerOpen: mode === "pro" ? true : p.mixerOpen,
    }));
  }, []);

  const patch = useCallback((partial: Partial<UiPrefs>) => {
    setPrefs((p) => ({ ...p, ...partial }));
  }, []);

  return { prefs, setMode, patch };
};
