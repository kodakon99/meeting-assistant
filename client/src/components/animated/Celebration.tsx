type Props = {
  visible: boolean
  size?: number
}

export function Celebration({ visible, size = 38 }: Props) {
  if (!visible) return null
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 pointer-events-none flex items-center justify-center"
        aria-hidden
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="absolute w-1.5 h-1.5 rounded-full animate-ma-burst"
            style={
              {
                background: `oklch(0.78 0.16 ${150 + i * 18})`,
                '--angle': `${i * 30}deg`,
                animationDelay: '0.15s',
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="animate-ma-pop" style={{ color: 'oklch(0.62 0.14 152)' }}>
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
          <circle
            cx="12"
            cy="12"
            r="11"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{
              strokeDasharray: 70,
              strokeDashoffset: 70,
              animation: 'ma-draw 0.7s ease-out 0.05s forwards',
            }}
          />
          <path
            d="M6.5 12.5 L10.5 16.5 L17.5 8.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 22,
              strokeDashoffset: 22,
              animation: 'ma-draw 0.4s ease-out 0.45s forwards',
            }}
          />
        </svg>
      </div>
    </div>
  )
}
