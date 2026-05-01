import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { Meeting, Participant, Project, Task } from '../lib/types'
import {
  enrichTasks,
  todayIso,
  type EnrichedTask,
} from '../lib/taskGraph'
import { buildTaskActivity } from '../lib/taskActivity'
import type { TaskActivityEvent } from '../lib/taskActivity'
import { ProjectTabs } from '../components/ProjectTabs'
import { TaskCard } from '../components/TaskCard'
import { Card } from '../components/Card'

export function PersonalRedirect() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    api
      .getProject(id)
      .then(setProject)
      .catch((e: Error) => setError(e.message))
  }, [id])

  if (error) {
    return (
      <p className="rounded-md bg-[oklch(0.95_0.05_18)] p-3 text-sm text-rose-status">{error}</p>
    )
  }
  if (!project) return <p className="text-ink-3">Loading…</p>
  const first = project.participants[0]
  if (!first) {
    return (
      <p className="text-ink-3">
        Add at least one participant to this project to view personal tasks.
      </p>
    )
  }
  return <Navigate to={`/projects/${project.id}/me/${first.id}`} replace />
}

function bySection(tasks: EnrichedTask[]): {
  waiting: EnrichedTask[]
  upNext: EnrichedTask[]
  inProgress: EnrichedTask[]
  done: EnrichedTask[]
} {
  const waiting: EnrichedTask[] = []
  const upNext: EnrichedTask[] = []
  const inProgress: EnrichedTask[] = []
  const done: EnrichedTask[] = []
  for (const t of tasks) {
    if (t.status === 'done') {
      done.push(t)
      continue
    }
    if (t.status === 'in_progress') {
      inProgress.push(t)
      continue
    }
    const blocked = t.blockedBy.some((b) => !b.done)
    if (blocked) waiting.push(t)
    else upNext.push(t)
  }
  const sorter = (a: EnrichedTask, b: EnrichedTask) => {
    if (a.deadline === b.deadline) return 0
    if (a.deadline === null) return 1
    if (b.deadline === null) return -1
    return a.deadline < b.deadline ? -1 : 1
  }
  waiting.sort(sorter)
  upNext.sort(sorter)
  inProgress.sort(sorter)
  done.sort((a, b) =>
    (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
  )
  return { waiting, upNext, inProgress, done }
}

export function PersonalDashboard() {
  const { id, participantId } = useParams<{
    id: string
    participantId: string
  }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDone, setShowDone] = useState(false)

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

  const me: Participant | null = useMemo(() => {
    return (
      project?.participants.find((p) => p.id === participantId) ?? null
    )
  }, [project, participantId])

  const myEnriched = useMemo(() => {
    if (!participantId) return []
    return enrichTasks(tasks, todayIso()).filter(
      (t) => t.ownerParticipantId === participantId,
    )
  }, [tasks, participantId])

  const activityByTask = useMemo(() => {
    const map = new Map<string, TaskActivityEvent[]>()
    for (const t of tasks) map.set(t.id, buildTaskActivity(t, meetings))
    return map
  }, [tasks, meetings])

  const sections = useMemo(() => bySection(myEnriched), [myEnriched])

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

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">
            {project.name}
          </h1>
          <p className="mt-1 text-sm text-ink-3">
            My tasks · viewing as{' '}
            <span className="font-medium text-ink-2">
              {me?.name ?? '—'}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-ink-3" htmlFor="participant">
            Viewing as
          </label>
          <select
            id="participant"
            value={participantId ?? ''}
            onChange={(e) =>
              navigate(`/projects/${project.id}/me/${e.target.value}`)
            }
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {project.participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-[oklch(0.95_0.05_18)] p-3 text-sm text-rose-status">
          {error}
        </p>
      )}

      <Section
        title="Waiting on others"
        tasks={sections.waiting}
        emptyText="Nothing blocking you."
        onMarkDone={markDone}
        activityByTask={activityByTask}
      />
      <Section
        title="Up next"
        tasks={sections.upNext}
        emptyText="Nothing pending."
        onMarkDone={markDone}
        activityByTask={activityByTask}
      />
      <Section
        title="In progress"
        tasks={sections.inProgress}
        emptyText="Nothing in progress."
        onMarkDone={markDone}
        activityByTask={activityByTask}
      />

      <section className="mb-2 mt-8">
        <button
          type="button"
          onClick={() => setShowDone((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-ink-2 hover:text-ink"
        >
          <span>{showDone ? '▼' : '▶'}</span>
          Done ({sections.done.length})
        </button>
        {showDone && (
          <ul className="mt-3 space-y-3">
            {sections.done.length === 0 ? (
              <li>
                <Card className="p-4 text-sm text-ink-3">
                  Nothing completed yet.
                </Card>
              </li>
            ) : (
              sections.done.map((t) => (
                <li key={t.id}>
                  <TaskCard
                    task={t}
                    showOwner={false}
                    activity={activityByTask.get(t.id)}
                  />
                </li>
              ))
            )}
          </ul>
        )}
      </section>
    </div>
  )
}

function Section({
  title,
  tasks,
  emptyText,
  onMarkDone,
  activityByTask,
}: {
  title: string
  tasks: EnrichedTask[]
  emptyText: string
  onMarkDone: (id: string) => void
  activityByTask: Map<string, TaskActivityEvent[]>
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-3">
        {title}{' '}
        <span className="ml-1 font-normal lowercase tracking-normal text-ink-3">
          ({tasks.length})
        </span>
      </h2>
      {tasks.length === 0 ? (
        <Card className="p-4 text-sm text-ink-3">{emptyText}</Card>
      ) : (
        <ul className="space-y-3">
          {tasks.map((t) => (
            <li key={t.id}>
              <TaskCard
                task={t}
                showOwner={false}
                onMarkDone={onMarkDone}
                activity={activityByTask.get(t.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
