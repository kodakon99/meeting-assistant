import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { Meeting, Project, Task, TaskStatus } from '../lib/types'
import {
  enrichTasks,
  todayIso,
  type EnrichedTask,
} from '../lib/taskGraph'
import { buildTaskActivity } from '../lib/taskActivity'
import { ProjectTabs } from '../components/ProjectTabs'
import { TaskCard } from '../components/TaskCard'
import { Card } from '../components/Card'

const STATUS_ORDER: Record<TaskStatus, number> = {
  pending: 0,
  in_progress: 1,
  done: 2,
}

function compareTasks(a: EnrichedTask, b: EnrichedTask): number {
  const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  if (so !== 0) return so
  if (a.deadline === b.deadline) return 0
  if (a.deadline === null) return 1
  if (b.deadline === null) return -1
  return a.deadline < b.deadline ? -1 : 1
}

export function TeamDashboard() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    Promise.all([
      api.getProject(id),
      api.listProjectTasks(id),
      api.listMeetings(id),
    ])
      .then(([p, t, m]) => {
        if (cancelled) return
        setProject(p)
        setTasks(t)
        setMeetings(m)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id])

  const enriched = useMemo(() => enrichTasks(tasks, todayIso()), [tasks])

  const activityByTask = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildTaskActivity>>()
    for (const t of tasks) map.set(t.id, buildTaskActivity(t, meetings))
    return map
  }, [tasks, meetings])

  const groups = useMemo(() => {
    if (!project) return []
    const byOwner = new Map<string, EnrichedTask[]>()
    for (const t of enriched) {
      const key = t.ownerParticipantId ?? '__unassigned__'
      if (!byOwner.has(key)) byOwner.set(key, [])
      byOwner.get(key)!.push(t)
    }
    const ordered: { key: string; label: string; tasks: EnrichedTask[] }[] = []
    for (const p of project.participants) {
      const list = byOwner.get(p.id)
      if (list && list.length > 0) {
        ordered.push({
          key: p.id,
          label: p.name,
          tasks: [...list].sort(compareTasks),
        })
      }
    }
    const unassigned = byOwner.get('__unassigned__')
    if (unassigned && unassigned.length > 0) {
      ordered.push({
        key: '__unassigned__',
        label: 'Unassigned',
        tasks: [...unassigned].sort(compareTasks),
      })
    }
    return ordered
  }, [enriched, project])

  const stats = useMemo(() => {
    const total = enriched.length
    const atRisk = enriched.filter(
      (t) =>
        t.status !== 'done' &&
        ((t.buffer !== null && t.buffer < 0) || t.isOverdue),
    ).length
    const owners = new Set(
      enriched
        .map((t) => t.ownerParticipantId)
        .filter((x): x is string => Boolean(x)),
    ).size
    return { total, atRisk, owners }
  }, [enriched])

  async function markDone(taskId: string) {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: 'done' } : t)),
    )
    try {
      const updated = await api.updateTask(taskId, { status: 'done' })
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (loading) return <p className="text-ink-3">Loading…</p>
  if (error && !project) {
    return (
      <p className="rounded-md bg-[oklch(0.95_0.05_18)] p-3 text-sm text-rose-status">{error}</p>
    )
  }
  if (!project) return null

  return (
    <div>
      <ProjectTabs project={project} />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">
          {project.name}
        </h1>
        <p className="mt-1 text-sm text-ink-3">
          Team dashboard ·{' '}
          {stats.total === 0
            ? 'no tasks yet'
            : `${stats.total} task${stats.total === 1 ? '' : 's'} across ${stats.owners} ${stats.owners === 1 ? 'person' : 'people'}`}
          {stats.atRisk > 0 && ` · ${stats.atRisk} at risk`}
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-[oklch(0.95_0.05_18)] p-3 text-sm text-rose-status">
          {error}
        </p>
      )}

      {enriched.length === 0 ? (
        <Card className="p-6 text-center text-ink-3">
          No tasks yet — extract one from a meeting first.
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-3">
                {g.label}{' '}
                <span className="ml-1 font-normal lowercase tracking-normal text-ink-3">
                  ({g.tasks.length})
                </span>
              </h2>
              <ul className="space-y-3">
                {g.tasks.map((t) => (
                  <li key={t.id}>
                    <TaskCard
                      task={t}
                      showOwner={false}
                      onMarkDone={markDone}
                      activity={activityByTask.get(t.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
