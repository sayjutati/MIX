import { create } from "zustand";
import {
  createHistory,
  pushHistory,
  redo,
  undo,
  type HistoryStack,
} from "../history/history";
import { localCanvasProvider } from "../generate/generationService";
import { getAssetUrl, revokeAssetUrl, saveImageAsset } from "../storage/imageAssets";
import { assetExists, importImageFile } from "../storage/projectStorage";
import {
  makeLayer,
  makeProject,
  type EditorTab,
  type ExportFormat,
  type ExportOptions,
  type GenerateParams,
  type Layer,
  type LayerAdjustments,
  type PhotoProject,
  type RasterLayer,
} from "../types/document";

type PhotoState = {
  project: PhotoProject;
  selectedLayerId: string | null;
  activeTab: EditorTab;
  zoom: number;
  panX: number;
  panY: number;
  generating: boolean;
  renderError: string | null;
  hist: HistoryStack;
  assetUrls: Record<string, string>;
  gestureLock: boolean;

  patch: (
    partial: Partial<
      Pick<PhotoState, "activeTab" | "zoom" | "panX" | "panY" | "selectedLayerId" | "renderError">
    >
  ) => void;
  commit: (updater: (p: PhotoProject) => PhotoProject) => void;
  beginGesture: () => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;

  newProject: (w?: number, h?: number) => void;
  loadProject: (p: PhotoProject) => Promise<string[]>;
  hydrateAssets: () => Promise<string[]>;
  setProjectName: (name: string) => void;
  setCanvasSize: (w: number, h: number) => void;
  setBackground: (color: string) => void;
  fitToView: (viewportW: number, viewportH: number) => void;
  resetView: () => void;

  importFile: (file: File) => Promise<void>;
  generateImage: (params: GenerateParams) => Promise<void>;
  addLayerFromAsset: (assetId: string, width: number, height: number, name: string) => void;

  selectLayer: (id: string | null) => void;
  updateLayer: (id: string, patch: Partial<RasterLayer>) => void;
  updateAdjustments: (id: string, patch: Partial<LayerAdjustments>) => void;
  moveLayer: (id: string, dx: number, dy: number) => void;
  reorderLayer: (id: string, dir: "up" | "down") => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  toggleLayerLock: (id: string) => void;

  resolveAssetUrl: (id: string) => string | null;
  refreshAssetUrl: (id: string) => Promise<void>;
  exportImage: (format: ExportFormat, options?: ExportOptions) => Promise<Blob>;
};

const touch = (p: PhotoProject): PhotoProject => ({ ...p, updatedAt: Date.now() });

const patchProject = (
  project: PhotoProject,
  updater: (p: PhotoProject) => PhotoProject
): PhotoProject => touch(updater(project));

export const usePhotoStore = create<PhotoState>((set, get) => ({
  project: makeProject(),
  selectedLayerId: null,
  activeTab: "generate",
  zoom: 1,
  panX: 0,
  panY: 0,
  generating: false,
  renderError: null,
  hist: createHistory(),
  assetUrls: {},
  gestureLock: false,

  patch: (partial) => set(partial),

  commit: (updater) =>
    set((s) => ({
      hist: pushHistory(s.hist, s.project),
      project: patchProject(s.project, updater),
    })),

  beginGesture: () => {
    const s = get();
    if (s.gestureLock) return;
    set({ hist: pushHistory(s.hist, s.project), gestureLock: true });
  },

  endGesture: () => set({ gestureLock: false }),

  undo: () => {
    const s = get();
    const r = undo(s.hist, s.project);
    if (r) {
      const sel = r.state.layers.find((l) => l.id === s.selectedLayerId);
      set({
        hist: r.hist,
        project: r.state,
        selectedLayerId: sel ? s.selectedLayerId : (r.state.layers[r.state.layers.length - 1]?.id ?? null),
      });
    }
  },

  redo: () => {
    const s = get();
    const r = redo(s.hist, s.project);
    if (r) set({ hist: r.hist, project: r.state });
  },

  newProject: (w, h) =>
    set({
      project: makeProject({ width: w ?? 1920, height: h ?? 1080, layers: [] }),
      selectedLayerId: null,
      hist: createHistory(),
      assetUrls: {},
      zoom: 1,
      panX: 0,
      panY: 0,
      renderError: null,
    }),

  hydrateAssets: async () => {
    const { project } = get();
    const urls: Record<string, string> = { ...get().assetUrls };
    const missing: string[] = [];
    for (const layer of project.layers) {
      if (urls[layer.assetId]) continue;
      const exists = await assetExists(layer.assetId);
      if (!exists) {
        missing.push(layer.name);
        continue;
      }
      const url = await getAssetUrl(layer.assetId);
      if (url) urls[layer.assetId] = url;
      else missing.push(layer.name);
    }
    set({ assetUrls: urls });
    return missing;
  },

  loadProject: async (p) => {
    set({
      project: p,
      hist: createHistory(),
      selectedLayerId: p.layers[0]?.id ?? null,
      assetUrls: {},
      renderError: null,
    });
    return get().hydrateAssets();
  },

  setProjectName: (name) => get().commit((p) => ({ ...p, name: name.trim() || "無題" })),

  setCanvasSize: (width, height) => get().commit((p) => ({ ...p, width, height })),

  setBackground: (background) => get().commit((p) => ({ ...p, background })),

  fitToView: (viewportW, viewportH) => {
    const { project } = get();
    const pad = 64;
    const scale = Math.min(
      (viewportW - pad) / project.width,
      (viewportH - pad) / project.height,
      2
    );
    set({ zoom: Math.max(0.1, scale), panX: 0, panY: 0 });
  },

  resetView: () => set({ zoom: 1, panX: 0, panY: 0 }),

  importFile: async (file) => {
    const { project } = get();
    const { assetId, width, height, name } = await importImageFile(project.id, file);
    const url = await getAssetUrl(assetId);
    const layer = makeLayer({ assetId, width, height, name });
    get().commit((p) => ({
      ...p,
      layers: [...p.layers, layer],
    }));
    set((s) => ({
      selectedLayerId: layer.id,
      activeTab: "adjust",
      assetUrls: url ? { ...s.assetUrls, [assetId]: url } : s.assetUrls,
      renderError: null,
    }));
  },

  generateImage: async (params) => {
    if (!params.prompt.trim()) {
      throw new Error("プロンプトを入力してください");
    }
    set({ generating: true });
    try {
      const result = await localCanvasProvider.generate(params);
      const { project } = get();
      const assetId = await saveImageAsset(
        project.id,
        result.blob,
        `生成: ${params.prompt.slice(0, 24)}`,
        result.width,
        result.height
      );
      const url = await getAssetUrl(assetId);
      const layer = makeLayer({
        assetId,
        width: result.width,
        height: result.height,
        name: params.prompt.slice(0, 20) || "生成画像",
      });
      get().commit((p) => ({ ...p, layers: [...p.layers, layer] }));
      set((s) => ({
        selectedLayerId: layer.id,
        activeTab: "adjust",
        assetUrls: url ? { ...s.assetUrls, [assetId]: url } : s.assetUrls,
        renderError: null,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "生成に失敗しました";
      throw new Error(msg);
    } finally {
      set({ generating: false });
    }
  },

  addLayerFromAsset: (assetId, width, height, name) => {
    const layer = makeLayer({ assetId, width, height, name });
    get().commit((p) => ({ ...p, layers: [...p.layers, layer] }));
    set({ selectedLayerId: layer.id });
  },

  selectLayer: (id) => set({ selectedLayerId: id }),

  updateLayer: (id, patch) => {
    const layer = get().project.layers.find((l) => l.id === id);
    if (layer?.locked) return;
    const apply = (p: PhotoProject) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    });
    if (get().gestureLock) {
      set((s) => ({ project: patchProject(s.project, apply) }));
    } else {
      get().commit(apply);
    }
  },

  updateAdjustments: (id, patch) => {
    const layer = get().project.layers.find((l) => l.id === id);
    if (layer?.locked) return;
    const apply = (p: PhotoProject) => ({
      ...p,
      layers: p.layers.map((l) =>
        l.id === id ? { ...l, adjustments: { ...l.adjustments, ...patch } } : l
      ),
    });
    if (get().gestureLock) {
      set((s) => ({ project: patchProject(s.project, apply) }));
    } else {
      get().commit(apply);
    }
  },

  moveLayer: (id, dx, dy) => {
    const layer = get().project.layers.find((l) => l.id === id);
    if (!layer || layer.locked) return;
    const apply = (p: PhotoProject) => ({
      ...p,
      layers: p.layers.map((l) =>
        l.id === id
          ? { ...l, transform: { ...l.transform, x: l.transform.x + dx, y: l.transform.y + dy } }
          : l
      ),
    });
    if (get().gestureLock) {
      set((s) => ({ project: patchProject(s.project, apply) }));
    } else {
      get().commit(apply);
    }
  },

  reorderLayer: (id, dir) =>
    get().commit((p) => {
      const idx = p.layers.findIndex((l) => l.id === id);
      if (idx < 0) return p;
      const next = [...p.layers];
      const swap = dir === "up" ? idx + 1 : idx - 1;
      if (swap < 0 || swap >= next.length) return p;
      [next[idx], next[swap]] = [next[swap]!, next[idx]!];
      return { ...p, layers: next };
    }),

  removeLayer: (id) => {
    get().commit((p) => ({ ...p, layers: p.layers.filter((l) => l.id !== id) }));
    const s = get();
    if (s.selectedLayerId === id) {
      set({ selectedLayerId: s.project.layers[s.project.layers.length - 1]?.id ?? null });
    }
  },

  duplicateLayer: (id) => {
    const src = get().project.layers.find((l) => l.id === id);
    if (!src) return;
    const copy = makeLayer({
      ...structuredClone(src),
      assetId: src.assetId,
      name: `${src.name} コピー`,
      transform: { ...src.transform, x: src.transform.x + 20, y: src.transform.y + 20 },
    });
    get().commit((p) => ({ ...p, layers: [...p.layers, copy] }));
    set({ selectedLayerId: copy.id });
  },

  toggleLayerVisibility: (id) =>
    get().commit((p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
    })),

  toggleLayerLock: (id) =>
    get().commit((p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)),
    })),

  resolveAssetUrl: (id) => get().assetUrls[id] ?? null,

  refreshAssetUrl: async (id) => {
    const url = await getAssetUrl(id);
    if (url) set((s) => ({ assetUrls: { ...s.assetUrls, [id]: url } }));
  },

  exportImage: async (format, options = {}) => {
    const { project, resolveAssetUrl } = get();
    const quality = options.quality ?? 0.92;
    const transparent = options.transparent && format === "png";
    const canvas = document.createElement("canvas");
    canvas.width = project.width;
    canvas.height = project.height;
    const ctx = canvas.getContext("2d")!;
    const { renderProject, canvasToBlob } = await import("../canvas/layerRenderer");
    await renderProject(ctx, project, resolveAssetUrl, { skipBackground: transparent });
    return canvasToBlob(canvas, format, quality);
  },
}));

export const useSelectedLayer = (): Layer | null => {
  const project = usePhotoStore((s) => s.project);
  const id = usePhotoStore((s) => s.selectedLayerId);
  return project.layers.find((l) => l.id === id) ?? null;
};

/** プロジェクト切替時に古い Blob URL を解放 */
export const revokeProjectAssets = (assetIds: string[]) => {
  for (const id of assetIds) revokeAssetUrl(id);
};
