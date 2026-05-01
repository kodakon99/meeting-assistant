import { useEffect, useState } from 'react'
import type { Participant, Task } from '../../lib/types'
import { CountUp } from '../ui/CountUp'
import { AvatarStack } from '../ui/Avatar'

type Props = {
  tasks: Task[]
  participants: Participant[]
}

export function ProjectStats({ tasks, participants }: Props) {
  const total = tasks.length
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length
  const done = tasks.filter((t) => t.status === 'done').length
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  const ownersSet = new Set(
    tasks.map((t) => t.ownerDisplayName).filter(Boolean),
  )
  const ownersCount = ownersSet.size

  const [progressWidth, setProgressWidth] = useState(0)
  useEffect(() => {
    const id = setTimeout(() => setProgressWidth(pct), 80)
    return () => clearTimeout(id)
  }, [pct])

  const firstNames = participants
    .map((p) => p.name.split(/\s+/)[0])
    .slice(0, 4)
    .join(', ')

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard label="Tasks" delay={0}>
        <div className="text-[30px] font-semibold tracking-tight text-ink font-tabular">
          <CountUp value={total} />
        </div>
        <p className="text-[12px] text-ink-3 m-0">
          across {ownersCount} {ownersCount === 1 ? 'person' : 'people'}
        </p>
      </StatCard>

      <StatCard label="In progress" delay={60}>
        <div className="text-[30px] font-semibold tracking-tight text-ink font-tabular">
          <CountUp value={inProgress} />
        </div>
        <p className="text-[12px] text-ink-3 m-0">moving this week</p>
      </StatCard>

      <StatCard label="Completed" delay={120}>
        <div className="text-[30px] font-semibold tracking-tight text-ink font-tabular">
          <CountUp value={done} />
          <span className="text-[18px] text-ink-3 ml-0.5">/{total}</span>
        </div>
        <p className="text-[12px] text-ink-3 m-0">{pct}% done</p>
        <div className="mt-1.5 h-1 bg-surface-2 rounded-[3px] overflow-hidden">
          <span
            className="block h-full bg-gradient-accent rounded-[3px] transition-[width] duration-[800ms] ease-smooth"
            style={{ width: `${progressWidth}%` }}
          />
        </div>
      </StatCard>

      <StatCard label="Team" delay={180}>
        <div className="mt-0.5">
          <AvatarStack
            people={participants.map((p) => ({ id: p.id, name: p.name }))}
            size={28}
            max={5}
          />
        </div>
        <p className="text-[12px] text-ink-3 m-0 mt-1 truncate">
          {firstNames || '—'}
        </p>
      </StatCard>
    </div>
  )
}

function StatCard({
  label,
  delay,
  children,
}: {
  label: string
  delay: number
  children: React.ReactNode
}) {
  return (
    <div
      className="bg-surface border border-line rounded-card p-4 flex flex-col gap-1 animate-ma-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
        {label}
      </span>
      {children}
    </div>
  )
}
