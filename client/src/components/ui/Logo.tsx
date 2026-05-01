type Props = { size?: number }

export function Logo({ size = 28 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className="block">
      <defs>
        <linearGradient id="ma-logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.62 0.18 280)" />
          <stop offset="50%" stopColor="oklch(0.66 0.16 250)" />
          <stop offset="100%" stopColor="oklch(0.70 0.14 220)" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="4" fill="url(#ma-logo-grad)" />
      <path
        d="M 16 7 a 9 9 0 0 1 0 18"
        fill="none"
        stroke="url(#ma-logo-grad)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M 16 2 a 14 14 0 0 1 0 28"
        fill="none"
        stroke="url(#ma-logo-grad)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  )
}
