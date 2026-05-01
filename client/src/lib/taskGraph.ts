import type { Task } from './types'

export type EarliestStartReason =
  | 'today'
  | 'after-upstream'
  | 'blocked-undated'
  | 'circular'

export type BlockedByEntry = {
  taskId: string
  description: string
  ownerDisplayName: string
  deadline: string | null
  done: boolean
}

export type EnrichedTask = Task & {
  earliestStart: string | null
  earliestStartReason: EarliestStartReason | null
  buffer: number | null
  isOverdue: boolean
  blockedBy: BlockedByEntry[]
}

export function todayIso(): string {
  return toIso(new Date())
}

function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function isWeekend(d: Date): boolean {
  const dow = d.getDay()
  return dow === 0 || dow === 6
}

export function nextBusinessDay(iso: string): string {
  const d = fromIso(iso)
  while (isWeekend(d)) {
    d.setDate(d.getDate() + 1)
  }
  return toIso(d)
}

export function addBusinessDays(iso: string, days: number): string {
  const d = fromIso(iso)
  let remaining = Math.abs(days)
  const step = days >= 0 ? 1 : -1
  while (remaining > 0) {
    d.setDate(d.getDate() + step)
    if (!isWeekend(d)) remaining--
  }
  return toIso(d)
}

export function businessDaysBetween(startIso: string, endIso: string): number {
  const startDate = fromIso(startIso)
  const endDate = fromIso(endIso)
  const sign = startDate <= endDate ? 1 : -1
  const earlier = sign > 0 ? startDate : endDate
  const later = sign > 0 ? endDate : startDate
  let count = 0
  const cursor = new Date(earlier)
  while (cursor < later) {
    cursor.setDate(cursor.getDate() + 1)
    if (!isWeekend(cursor)) count++
  }
  return sign * count
}

function maxIso(a: string, b: string): string {
  return a > b ? a : b
}

function hasCycle(tasksById: Map<string, Task>, startId: string): boolean {
  const stack: string[] = [...(tasksById.get(startId)?.dependsOn ?? [])]
  const visited = new Set<string>()
  while (stack.length > 0) {
    const id = stack.pop()!
    if (id === startId) return true
    if (visited.has(id)) continue
    visited.add(id)
    const t = tasksById.get(id)
    if (!t) continue
    for (const upId of t.dependsOn) stack.push(upId)
  }
  return false
}

export function enrichTasks(tasks: Task[], today: string): EnrichedTask[] {
  const tasksById = new Map(tasks.map((t) => [t.id, t]))
  const todayBusinessFloor = nextBusinessDay(today)

  return tasks.map((t): EnrichedTask => {
    const blockedBy: BlockedByEntry[] = t.dependsOn
      .map((upId) => {
        const u = tasksById.get(upId)
        return u
          ? {
              taskId: u.id,
              description: u.description || '(untitled)',
              ownerDisplayName: u.ownerDisplayName,
              deadline: u.deadline,
              done: u.status === 'done',
            }
          : null
      })
      .filter((x): x is BlockedByEntry => x !== null)

    const isOverdue =
      t.status !== 'done' && t.deadline !== null && t.deadline < today

    if (hasCycle(tasksById, t.id)) {
      return {
        ...t,
        earliestStart: null,
        earliestStartReason: 'circular',
        buffer: null,
        isOverdue,
        blockedBy,
      }
    }

    let hasUndatedBlocker = false
    let derivedStart: string | null = null

    for (const u of blockedBy) {
      if (u.done) continue
      if (u.deadline === null) {
        hasUndatedBlocker = true
      } else {
        const candidate = addBusinessDays(u.deadline, 1)
        derivedStart =
          derivedStart === null ? candidate : maxIso(derivedStart, candidate)
      }
    }

    let earliestStart: string | null = null
    let earliestStartReason: EarliestStartReason | null = null

    if (hasUndatedBlocker) {
      earliestStartReason = 'blocked-undated'
    } else if (derivedStart) {
      earliestStart = maxIso(todayBusinessFloor, derivedStart)
      earliestStartReason = 'after-upstream'
    } else {
      earliestStart = todayBusinessFloor
      earliestStartReason = 'today'
    }

    const buffer =
      earliestStart && t.deadline
        ? businessDaysBetween(earliestStart, t.deadline)
        : null

    return {
      ...t,
      earliestStart,
      earliestStartReason,
      buffer,
      isOverdue,
      blockedBy,
    }
  })
}

export function formatBuffer(buffer: number | null): string {
  if (buffer === null) return '—'
  if (buffer === 0) return 'due today'
  if (buffer < 0) return `${Math.abs(buffer)}d overdue`
  return `${buffer}d`
}

export function formatIsoDate(iso: string | null): string {
  if (!iso) return '—'
  const d = fromIso(iso)
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
