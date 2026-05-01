import { useMemo } from 'react'
import type { Task, TaskStatus } from '../../lib/types'
import { Avatar } from '../ui/Avatar'
import { StatusPill } from '../ui/StatusPill'
import { formatIsoDate } from '../../lib/taskGraph'

type Props = {
  tasks: Task[]
  focusId?: string | null
  onFocus?: (id: string | null) => void
  onToggleDone?: (id: string, nextStatus: TaskStatus) => void
}

export function TaskList({ tasks, focusId, onFocus, onToggleDone }: Props) {
  const groups = useMemo(() => {
    const byOwner = new Map<string, Task[]>()
    for (const t of tasks) {
      const k = t.ownerDisplayName || 'Unassigned'
      if (!byOwner.has(k)) byOwner.set(k, [])
      byOwner.get(k)!.push(t)
    }
    return [...byOwner.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [tasks])

  if (tasks.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-card p-6 text-center text-ink-3 text-[13px]">
        No tasks yet — capture a meeting to extract them.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[18px]">
      {groups.map(([ownerName, list]) => (
        <section key={ownerName} className="flex flex-col gap-1.5">
          <header className="flex items-center gap-2.5 px-1">
            <Avatar
              person={{ id: ownerName, name: ownerName }}
              size={26}
            />
            <div className="flex-1">
              <span className="font-semibold text-[13.5px] text-ink">
                {ownerName}
              </span>
            </div>
            <span className="font-mono text-[11px] text-ink-3">
              {list.length}
            </span>
          </header>
          <ul className="flex flex-col gap-1 m-0 p-0 list-none">
            {list.map((t, i) => {
              const isFocus = focusId === t.id
              const done = t.status === 'done'
              return (
                <li
                  key={t.id}
                  className={`grid grid-cols-[22px_1fr_auto] gap-3 items-center bg-surface border rounded-[10px] px-3.5 py-2.5 animate-ma-fade-up transition-[border-color,background,transform] hover:border-line-2 hover:translate-x-0.5 ${
                    isFocus
                      ? 'border-accent bg-accent-soft'
                      : 'border-line'
                  }`}
                  style={{ animationDelay: `${i * 50}ms` }}
                  onMouseEnter={() => onFocus?.(t.id)}
                  onMouseLeave={() => onFocus?.(null)}
                >
                  <button
                    type="button"
                    aria-label="Toggle done"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleDone?.(t.id, done ? 'pending' : 'done')
                    }}
                    className={`w-5 h-5 rounded-md inline-flex items-center justify-center cursor-pointer transition-all ${
                      done
                        ? 'bg-emerald-status border border-emerald-status text-[oklch(0.99_0_0)] animate-ma-check-pop'
                        : 'bg-surface-2 border-[1.5px] border-line-2 text-transparent hover:border-accent'
                    }`}
                  >
                    <svg viewBox="0 0 16 16" width="12" height="12">
                      <path
                        d="M3 8.5 L7 12 L13 4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <span
                    className={`text-[13.5px] ${
                      done
                        ? 'text-ink-3 line-through decoration-ink-3'
                        : 'text-ink'
                    }`}
                  >
                    {t.description}
                  </span>
                  <span className="flex items-center gap-2.5">
                    <span className="font-mono text-[12px] text-ink-3">
                      {t.deadline ? formatIsoDate(t.deadline) : '—'}
                    </span>
                    <StatusPill status={t.status} />
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
