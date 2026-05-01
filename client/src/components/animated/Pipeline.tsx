export type Stage = { id: string; label: string; sublabel: string }

export const PIPELINE_STAGES: Stage[] = [
  { id: 'listening', label: 'Listening', sublabel: 'capturing audio' },
  { id: 'transcribing', label: 'Transcribing', sublabel: 'Whisper · streaming' },
  {
    id: 'speakers',
    label: 'Identifying speakers',
    sublabel: 'voices detected',
  },
  { id: 'extracting', label: 'Extracting tasks', sublabel: 'reading for actions' },
  { id: 'drafting', label: 'Drafting summary', sublabel: 'composing minutes' },
]

type Props = {
  stages: Stage[]
  activeIdx: number
  doneIdxs: number[]
  currentProgress: number
}

export function Pipeline({
  stages,
  activeIdx,
  doneIdxs,
  currentProgress,
}: Props) {
  return (
    <ol className="m-0 p-0 list-none flex flex-col gap-0.5">
      {stages.map((s, i) => {
        const done = doneIdxs.includes(i)
        const active = i === activeIdx
        const upcoming = !done && !active
        return (
          <li
            key={s.id}
            className={`grid grid-cols-[28px_1fr] gap-3.5 px-1 py-2.5 items-start relative transition-opacity duration-200 ${
              upcoming ? 'opacity-45' : ''
            }`}
            style={{
              opacity: upcoming ? 0.45 : 1,
            }}
          >
            {i < stages.length - 1 && (
              <span
                className="absolute left-[13px] top-7 -bottom-0.5 w-0.5"
                style={{ background: 'oklch(1 0 0 / 0.10)' }}
              />
            )}
            <span
              className={`relative w-7 h-7 rounded-full inline-flex items-center justify-center ${
                done
                  ? 'bg-emerald-status text-recorder-fg'
                  : active
                    ? 'bg-accent text-recorder-fg animate-ma-pulse'
                    : ''
              }`}
              style={{
                background: done
                  ? 'oklch(0.66 0.13 152)'
                  : active
                    ? 'var(--accent)'
                    : 'oklch(1 0 0 / 0.08)',
                color: done || active ? 'oklch(0.99 0.01 270)' : 'oklch(0.85 0.04 280)',
              }}
            >
              {done ? (
                <svg viewBox="0 0 16 16" width="14" height="14">
                  <path
                    d="M3 8.5 L7 12 L13 4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : active ? (
                <span className="w-2 h-2 rounded-full bg-current" />
              ) : (
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: 'oklch(1 0 0 / 0.5)' }}
                />
              )}
            </span>
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="flex gap-2.5 items-baseline">
                <span
                  className="font-semibold text-sm"
                  style={{ color: 'oklch(0.97 0.01 270)' }}
                >
                  {s.label}
                </span>
                <span
                  className="text-[12px]"
                  style={{ color: 'oklch(0.72 0.02 270)' }}
                >
                  {s.sublabel}
                </span>
              </div>
              <div
                className="h-[3px] rounded-[2px] overflow-hidden w-full max-w-[400px]"
                style={{ background: 'oklch(1 0 0 / 0.08)' }}
              >
                <span
                  className="block h-full bg-gradient-accent rounded-[2px] transition-[width] duration-[80ms]"
                  style={{
                    width: done
                      ? '100%'
                      : active
                        ? `${Math.round(currentProgress * 100)}%`
                        : '0%',
                  }}
                />
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
