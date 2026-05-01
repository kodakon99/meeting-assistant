import type { MeetingStatus, TaskStatus } from '../../lib/types'

type Tone = 'neutral' | 'amber' | 'indigo' | 'emerald' | 'sky' | 'rose'

type Cfg = { label: string; tone: Tone; dot: boolean }

const STATUS_CFG: Record<string, Cfg> = {
  // MeetingStatus
  uploaded: { label: 'Uploaded', tone: 'neutral', dot: false },
  transcribing: { label: 'Transcribing', tone: 'amber', dot: true },
  transcription_failed: { label: 'Transcription failed', tone: 'rose', dot: false },
  awaiting_speaker_confirmation: { label: 'Confirm speakers', tone: 'indigo', dot: true },
  speakers_confirmed: { label: 'Speakers confirmed', tone: 'emerald', dot: false },
  extracting: { label: 'Extracting tasks', tone: 'amber', dot: true },
  extraction_failed: { label: 'Extraction failed', tone: 'rose', dot: false },
  draft: { label: 'Draft ready', tone: 'sky', dot: false },
  dispatched: { label: 'Dispatched', tone: 'emerald', dot: false },

  // TaskStatus
  done: { label: 'Done', tone: 'emerald', dot: false },
  in_progress: { label: 'In progress', tone: 'amber', dot: true },
  pending: { label: 'Pending', tone: 'neutral', dot: false },

  // Computed
  overdue: { label: 'Overdue', tone: 'rose', dot: true },
}

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-[oklch(0.94_0.005_80)] text-ink-2',
  amber: 'bg-[oklch(0.96_0.05_80)] text-[oklch(0.42_0.13_70)]',
  indigo: 'bg-[oklch(0.95_0.04_280)] text-[oklch(0.40_0.14_280)]',
  emerald: 'bg-[oklch(0.95_0.05_152)] text-[oklch(0.40_0.12_152)]',
  sky: 'bg-[oklch(0.95_0.04_230)] text-[oklch(0.40_0.12_230)]',
  rose: 'bg-[oklch(0.95_0.05_18)] text-[oklch(0.42_0.16_18)]',
}

type Props = {
  status: MeetingStatus | TaskStatus | 'overdue' | string
  label?: string
  className?: string
}

export function StatusPill({ status, label, className = '' }: Props) {
  const cfg = STATUS_CFG[status] ?? { label: status, tone: 'neutral' as Tone, dot: false }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[11px] font-semibold leading-snug tracking-wide ${TONE_CLASSES[cfg.tone]} ${className}`}
    >
      {cfg.dot && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-current animate-ma-pulse"
        />
      )}
      {label ?? cfg.label}
    </span>
  )
}

export { STATUS_CFG }
