import type { Meeting, Task, TaskStatus } from './types'
import { formatIsoDate } from './taskGraph'

export type TaskActivityKind =
  | 'created'
  | 'status_changed'
  | 'deadline_changed'

export type TaskActivityEvent = {
  meetingId: string | null
  meetingDate: string | null   // ISO yyyy-mm-dd, null when source meeting was deleted
  kind: TaskActivityKind
  detail: string
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'pending',
  in_progress: 'in progress',
  done: 'done',
}

export function buildTaskActivity(
  task: Task,
  meetings: Meeting[],
): TaskActivityEvent[] {
  const meetingsById = new Map(meetings.map((m) => [m.id, m]))
  const events: TaskActivityEvent[] = []

  const creator = meetingsById.get(task.sourceMeetingId)
  events.push({
    meetingId: creator?.id ?? null,
    meetingDate: creator ? creator.createdAt.slice(0, 10) : null,
    kind: 'created',
    detail: 'Created',
  })

  for (const m of meetings) {
    if (!m.taskUpdates || m.taskUpdates.length === 0) continue
    for (const u of m.taskUpdates) {
      if (u.taskId !== task.id) continue
      const date = m.createdAt.slice(0, 10)
      if (u.before.status !== u.after.status) {
        events.push({
          meetingId: m.id,
          meetingDate: date,
          kind: 'status_changed',
          detail: `Status: ${STATUS_LABEL[u.before.status]} → ${STATUS_LABEL[u.after.status]}`,
        })
      }
      if (u.before.deadline !== u.after.deadline) {
        events.push({
          meetingId: m.id,
          meetingDate: date,
          kind: 'deadline_changed',
          detail: `Deadline: ${formatIsoDate(u.before.deadline)} → ${formatIsoDate(u.after.deadline)}`,
        })
      }
    }
  }

  return events.sort((a, b) => {
    const da = a.meetingDate ?? '0000-00-00'
    const db = b.meetingDate ?? '0000-00-00'
    return da.localeCompare(db)
  })
}

export function formatActivityDate(date: string | null): string {
  return date ? formatIsoDate(date) : '(unknown date)'
}
