import { useRef } from "react";
import type { PluginSlot, Track, TrackFx } from "../../types/project";
import { BUILTIN_PLUGINS, makeExternalPluginSlot } from "../../audio/trackFxChain";

type Props = {
  track: Track;
  onFxChange: (patch: Partial<TrackFx>) => void;
  onAddPlugin: (slot: PluginSlot) => void;
  onRemovePlugin: (slotId: string) => void;
};

export function FxPanel({ track, onFxChange, onAddPlugin, onRemovePlugin }: Props) {
  const fx = track.fx ?? {
    reverb: 0,
    delay: 0,
    delayTime: 0.25,
    eqLow: 0,
    eqHigh: 0,
    compressor: 0,
  };
  const fileRef = useRef<HTMLInputElement>(null);

  const loadExternalPlugin = (file: File, processorName: string) => {
    const url = URL.createObjectURL(file);
    onAddPlugin(
      makeExternalPluginSlot({
        workletUrl: url,
        processorName,
        name: file.name.replace(/\.js$/i, ""),
      })
    );
  };

  return (
    <aside className="fx-panel">
      <h3 className="fx-panel__title">FX / プラグイン</h3>
      <p className="fx-panel__sub">ビルトイン FX + 外部 AudioWorklet（.js）</p>

      <div className="fx-panel__sliders">
        {(
          [
            ["reverb", "リバーブ", fx.reverb],
            ["delay", "ディレイ", fx.delay],
            ["eqLow", "低音", fx.eqLow],
            ["eqHigh", "高音", fx.eqHigh],
            ["compressor", "コンプ", fx.compressor],
          ] as const
        ).map(([key, label, val]) => (
          <label key={key} className="fx-panel__slider">
            {label}
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={val}
              onChange={(e) => onFxChange({ [key]: Number(e.target.value) })}
            />
          </label>
        ))}
        <label className="fx-panel__slider">
          ディレイ時間
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={fx.delayTime}
            onChange={(e) => onFxChange({ delayTime: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="fx-panel__plugins">
        <span className="fx-panel__label">ビルトイン</span>
        <div className="fx-panel__builtin">
          {BUILTIN_PLUGINS.map((p) => (
            <span key={p.id} className="fx-panel__tag">
              {p.name}
            </span>
          ))}
        </div>

        <span className="fx-panel__label">外部プラグイン</span>
        <button
          type="button"
          className="fx-panel__add tooltip"
          data-tooltip="AudioWorklet プロセッサの .js を読み込み（registerProcessor 形式）"
          onClick={() => fileRef.current?.click()}
        >
          + プラグイン追加
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".js"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const name = prompt(
              "AudioWorklet の processor 名を入力（registerProcessor の第1引数）",
              "my-audio-processor"
            );
            if (name?.trim()) loadExternalPlugin(f, name.trim());
            e.target.value = "";
          }}
        />

        <ul className="fx-panel__list">
          {(track.plugins ?? []).map((pl) => (
            <li key={pl.id}>
              <span>{pl.name}</span>
              <span className="fx-panel__pl-type">
                {pl.pluginId === "external" ? "外部" : "内蔵"}
              </span>
              <button type="button" onClick={() => onRemovePlugin(pl.id)}>
                削除
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
