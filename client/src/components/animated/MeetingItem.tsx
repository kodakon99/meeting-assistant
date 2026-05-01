import { Link, useNavigate } from 'react-router-dom'
import type { Meeting } from '../../lib/types'
import { StatusPill } from '../ui/StatusPill'

function formatDuration(secs: number | null): string {
  if (secs == null) return '—'
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function spark(seed: string): number[] {
  // Deterministic pseudo-spark from id; visual decoration only.
  let h = 0
  for (let i = 0; i < seed.length; i++)
    h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const out: number[] = []
  for (let i = 0; i < 24; i++) {
    h = (h * 1664525 + 1013904223) >>> 0
    out.push(0.25 + ((h % 1000) / 1000) * 0.75)
  }
  return out
}

type Props = {
  meeting: Meeting
  projectId: string
  onDelete: (id: string) => void
  index?: number
}

export function MeetingItem({ meeting: m, projectId, onDelete, index = 0 }: Props) {
  const navigate = useNavigate()
  const bars = spark(m.id)
  const taskCount = m.tasksDraft?.length ?? 0
  const updateCount = m.taskUpdates?.length ?? 0

  function navigateToBest() {
    if (m.status === 'awaiting_speaker_confirmation') {
      navigate(`/projects/${projectId}/meetings/${m.id}/confirm`)
    } else if (m.status === 'draft') {
      navigate(`/projects/${projectId}/meetings/${m.id}/draft`)
    } else if (m.status === 'dispatched') {
      navigate(`/projects/${projectId}/meetings/${m.id}/dispatch`)
    }
  }

  return (
    <li
      className="animate-ma-fade-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={navigateToBest}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') navigateToBest()
        }}
        className="w-full grid items-center gap-4 px-4 py-3.5 text-left bg-surface border border-line rounded-card cursor-pointer transition-[border-color,box-shadow,transform] duration-200 hover:border-line-2 hover:shadow hover:-translate-y-px"
        style={{ gridTemplateColumns: '100px 1fr auto' }}
      >
        <div className="inline-flex items-center gap-[2px] h-9 px-1">
          {bars.map((v, i) => (
            <span
              key={i}
              className="inline-block w-[3px] rounded-[1.5px] opacity-70"
              style={{
                height: `${Math.round(v * 36)}px`,
                background:
                  'linear-gradient(180deg, var(--accent), var(--accent-2))',
              }}
            />
          ))}
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-[14px] text-ink truncate">
              {new Date(m.createdAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
            <StatusPill status={m.status} />
          </div>
          <div className="flex items-center gap-2 text-[12px] text-ink-3">
            <span>{formatDuration(m.durationSeconds)}</span>
            <span>·</span>
            <span>
              {(m.audioSizeBytes / 1024).toFixed(0)} KB
            </span>
            {m.detectedSpeakers && m.detectedSpeakers.length > 0 && (
              <>
                <span>·</span>
                <span>
                  {m.detectedSpeakers.length} speaker
                  {m.detectedSpeakers.length === 1 ? '' : 's'}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-[12px] text-ink-3">
          {taskCount > 0 && (
            <span>
              <strong className="text-ink font-semibold">{taskCount}</strong>{' '}
              task{taskCount === 1 ? '' : 's'}
            </span>
          )}
          {updateCount > 0 && (
            <span className="text-accent-ink">
              ↻ {updateCount} update{updateCount === 1 ? '' : 's'}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(m.id)
            }}
            className="text-[11px] text-ink-3 hover:text-rose-status transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
      {m.status === 'transcription_failed' && m.transcriptionError && (
        <p className="mt-1 text-[12px] text-rose-status px-4">
          {m.transcriptionError}
        </p>
      )}
      {m.status === 'extraction_failed' && m.extractionError && (
        <p className="mt-1 text-[12px] text-rose-status px-4">
          {m.extractionError}
        </p>
      )}
    </li>
  )
}

export { Link }
