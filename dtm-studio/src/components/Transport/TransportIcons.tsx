type IconProps = { className?: string };

export function IconPlay({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={18} height={18} aria-hidden>
      <path fill="currentColor" d="M8 5v14l11-7z" />
    </svg>
  );
}

export function IconStop({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={16} height={16} aria-hidden>
      <rect fill="currentColor" x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  );
}

export function IconRewind({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={16} height={16} aria-hidden>
      <path fill="currentColor" d="M11 6v12l-8-6 8-6zm9 0v12l-8-6 8-6z" />
    </svg>
  );
}

export function IconRecord({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={14} height={14} aria-hidden>
      <circle fill="currentColor" cx="12" cy="12" r="7" />
    </svg>
  );
}

export function IconLoop({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={16} height={16} aria-hidden>
      <path
        fill="currentColor"
        d="M17 7h-3V4l-5 5 5 5V11h3c2.76 0 5 2.24 5 5s-2.24 5-5 5h-1v2h1c3.87 0 7-3.13 7-7s-3.13-7-7-7zm-10 0H6V4L1 9l5 5V11h1c2.76 0 5 2.24 5 5s-2.24 5-5 5H6v-2h1c3.87 0 7-3.13 7-7s-3.13-7-7-7z"
      />
    </svg>
  );
}

export function IconMetronome({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={16} height={16} aria-hidden>
      <path fill="currentColor" d="M12 2L7 20h2l1-4h4l1 4h2L12 2zm0 6.5L13.5 16h-3L12 8.5z" />
    </svg>
  );
}
