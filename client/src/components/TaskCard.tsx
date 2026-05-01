import type { EnrichedTask } from '../lib/taskGraph'
import { formatBuffer, formatIsoDate } from '../lib/taskGraph'
import type { TaskActivityEvent } from '../lib/taskActivity'
import { formatActivityDate } from '../lib/taskActivity'
import { Card } from './Card'
import { Button } from './Button'
import { StatusPill } from './ui/StatusPill'

export function TaskCard({
  task,
  showOwner = true,
  onMarkDone,
  activity,
}: {
  task: EnrichedTask
  showOwner?: boolean
  onMarkDone?: (taskId: string) => void
  activity?: TaskActivityEvent[]
}) {
  const startReason = task.earliestStartReason
  const startLabel = task.earliestStart
    ? formatIsoDate(task.earliestStart)
    : startReason === 'blocked-undated'
      ? 'after upstream'
      : startReason === 'circular'
        ? '—'
        : '—'

  const bufferTone =
    task.buffer === null
      ? 'text-ink-3'
      : task.buffer < 0
        ? 'text-rose-status font-semibold'
        : task.buffer === 0
          ? 'text-amber-status font-semibold'
          : 'text-ink-2'

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p
            className={`m-0 font-semibold text-[14px] ${
              task.status === 'done'
                ? 'text-ink-3 line-through'
                : 'text-ink'
            }`}
          >
            {task.description || '(untitled)'}
          </p>
          {showOwner && (
            <p className="mt-0.5 text-[12px] text-ink-3 m-0">
              {task.ownerDisplayName}
            </p>
          )}
          {task.notes && (
            <p className="mt-1 text-[12px] italic text-ink-3 m-0">
              {task.notes}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {task.isOverdue && task.status !== 'done' && (
            <StatusPill status="overdue" />
          )}
          {startReason === 'circular' && (
            <span className="rounded-pill bg-[oklch(0.95_0.05_18)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-status">
              Circular
            </span>
          )}
          <StatusPill status={task.status} />
          {task.status !== 'done' && onMarkDone && (
            <Button variant="secondary" onClick={() => onMarkDone(task.id)}>
              Mark done
            </Button>
          )}
        </div>
      </div>

      {task.status !== 'done' && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-ink-2">
          <span>
            Earliest start:{' '}
            <span className="font-semibold text-ink">{startLabel}</span>
          </span>
          <span>
            Deadline:{' '}
            <span className="font-semibold text-ink">
              {formatIsoDate(task.deadline)}
            </span>
          </span>
          <span className={bufferTone}>
            Buffer:{' '}
            <span className="font-semibold">{formatBuffer(task.buffer)}</span>
          </span>
        </div>
      )}

      {task.blockedBy.filter((b) => !b.done).length > 0 && (
        <div className="mt-3 rounded-card bg-surface-2 p-3 text-[12px] text-ink-2">
          <p className="m-0 mb-1 font-semibold text-ink-2">Blocked by:</p>
          <ul className="m-0 p-0 list-none flex flex-col gap-1">
            {task.blockedBy
              .filter((b) => !b.done)
              .map((b) => (
                <li key={b.taskId}>
                  &ldquo;{b.description}&rdquo;
                  <span className="text-ink-3">
                    {' '}
                    — {b.ownerDisplayName}
                    {b.deadline && ` · due ${formatIsoDate(b.deadline)}`}
                    {b.deadline === null && ' · no deadline yet'}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {activity && activity.length > 1 && (
        <details className="mt-3 text-[12px] text-ink-2">
          <summary className="cursor-pointer text-ink-3 hover:text-ink-2 transition-colors">
            History ({activity.length} event{activity.length === 1 ? '' : 's'})
          </summary>
          <ul className="mt-2 m-0 p-0 list-none flex flex-col gap-1 border-l-2 border-line pl-3">
            {activity.map((e, i) => (
              <li key={i}>
                <span className="font-semibold text-ink-2">
                  {formatActivityDate(e.meetingDate)}
                </span>
                <span className="text-ink-3"> · {e.detail}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  )
}
