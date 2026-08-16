import { Sparkles, Sliders, Download } from "lucide-react";
import type { EditorTab } from "../types/document";

type Props = {
  active: EditorTab;
  onChange: (tab: EditorTab) => void;
};

const tabs: { id: EditorTab; label: string; icon: typeof Sparkles }[] = [
  { id: "generate", label: "生成", icon: Sparkles },
  { id: "adjust", label: "調整", icon: Sliders },
  { id: "export", label: "書出", icon: Download },
];

export const ToolSidebar = ({ active, onChange }: Props) => (
  <nav className="tool-sidebar" aria-label="ツール">
    {tabs.map(({ id, label, icon: Icon }) => (
      <button
        key={id}
        type="button"
        className={`tool-sidebar__btn ${active === id ? "tool-sidebar__btn--active" : ""}`}
        onClick={() => onChange(id)}
        title={label}
      >
        <Icon size={18} />
        <span>{label}</span>
      </button>
    ))}
  </nav>
);
