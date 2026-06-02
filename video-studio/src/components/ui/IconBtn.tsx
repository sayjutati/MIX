import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  variant?: "default" | "primary" | "danger" | "ghost";
  size?: "sm" | "md";
  className?: string;
}

export const IconBtn = ({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
  variant = "default",
  size = "md",
  className = "",
}: Props) => (
  <button
    type="button"
    className={`icon-btn icon-btn--${variant} icon-btn--${size} ${active ? "icon-btn--active" : ""} ${className}`}
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
  >
    <Icon size={size === "sm" ? 14 : 16} strokeWidth={2} />
    <span className="icon-btn__label">{label}</span>
  </button>
);
