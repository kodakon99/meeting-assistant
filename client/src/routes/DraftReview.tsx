import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { Meeting, Project, Task, TaskUpdate } from '../lib/types'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { formatIsoDate } from '../lib/taskGraph'

const STATUS_LABEL: Record<Task['status'], string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  done: 'Done',
}

function UpdateRow({ update }: { update: TaskUpdate }) {
  const statusChanged = update.before.status !== update.after.status
  const deadlineChanged = update.before.deadline !== update.after.deadline
  const closed = statusChanged && update.after.status === 'done'
  const reopened =
    statusChanged &&
    update.before.status === 'done' &&
    update.after.status !== 'done'

  const icon = closed ? '✓' : reopened ? '↺' : statusChanged ? '●' : '↻'
  const headline = closed
    ? 'Closed'
    : reopened
      ? 'Reopened'
      : statusChanged
        ? 'Status changed'
        : 'Deadline changed'

  return (
    <div className="flex items-start gap-3 p-3 text-sm">
      <span
        className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
          closed
            ? 'bg-emerald-100 text-emerald-700'
            : reopened
              ? 'bg-amber-100 text-amber-700'
              : 'bg-indigo-100 text-indigo-700'
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">
          {headline}: &ldquo;{update.description}&rdquo;
        </p>
        <div className="mt-1 space-y-0.5 text-xs text-ink-2">
          {statusChanged && (
            <p>
              Status:{' '}
              <span className="font-medium">
                {STATUS_LABEL[update.before.status]}
              </span>{' '}
              →{' '}
              <span className="font-medium text-ink">
                {STATUS_LABEL[update.after.status]}
              </span>
            </p>
          )}
          {deadlineChanged && (
            <p>
              Deadline:{' '}
              <span className="font-medium">
                {formatIsoDate(update.before.deadline)}
              </span>{' '}
              →{' '}
              <span className="font-medium text-ink">
                {formatIsoDate(update.after.deadline)}
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export function DraftReview() {
  const { id: projectId, meetingId } = useParams<{
    id: string
    meetingId: string
  }>()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [momDraft, setMomDraft] = useState<string>('')
  const [emails, setEmails] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId || !meetingId) return
    let cancelled = false
    Promise.all([
      api.getProject(projectId),
      api.getMeeting(meetingId),
      api.listMeetingTasks(meetingId),
    ])
      .then(([p, m, t]) => {
        if (cancelled) return
        setProject(p)
        setMeeting(m)
        setTasks(t)
        setMomDraft(m.mom ?? '')
        const emailMap: Record<string, string> = {}
        for (const person of p.participants) {
          emailMap[person.id] = person.email ?? ''
        }
        setEmails(emailMap)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [projectId, meetingId])

  async function saveMom() {
    if (!meeting) return
    try {
      const updated = await api.updateMeetingMom(meeting.id, momDraft)
      setMeeting(updated)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function saveEmail(participantId: string) {
    if (!project) return
    try {
      const raw = emails[participantId]?.trim() ?? ''
      const updated = await api.updateParticipantEmail(
        project.id,
        participantId,
        raw || null,
      )
      setProject(updated)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function addAndAssign(suggestedName: string) {
    if (!project) return
    try {
      const updatedProject = await api.addParticipant(project.id, suggestedName)
      setProject(updatedProject)
      const newParticipant = [...updatedProject.participants]
        .reverse()
        .find(
          (p) => p.name.trim().toLowerCase() === suggestedName.trim().toLowerCase(),
        )
      if (!newParticipant) return
      const targetTaskIds = tasks
        .filter(
          (t) =>
            t.ownerParticipantId === null &&
            t.suggestedOwnerName &&
            t.suggestedOwnerName.trim().toLowerCase() ===
              suggestedName.trim().toLowerCase(),
        )
        .map((t) => t.id)
      const updates = await Promise.all(
        targetTaskIds.map((id) =>
          api.updateTask(id, { ownerParticipantId: newParticipant.id }),
        ),
      )
      setTasks((prev) =>
        prev.map((t) => updates.find((u) => u.id === t.id) ?? t),
      )
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function patchTask(taskId: string, patch: Partial<Task>) {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
    )
    try {
      const updated = await api.updateTask(taskId, patch)
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function addTask() {
    if (!meeting) return
    try {
      const created = await api.createTask(meeting.id, {
        description: '',
      })
      setTasks((prev) => [...prev, created])
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function deleteTask(taskId: string) {
    setTasks((prev) =>
      prev
        .filter((t) => t.id !== taskId)
        .map((t) => ({
          ...t,
          dependsOn: t.dependsOn.filter((d) => d !== taskId),
        })),
    )
    try {
      await api.deleteTask(taskId)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const tasksById = useMemo(
    () => new Map(tasks.map((t) => [t.id, t])),
    [tasks],
  )

  if (loading) return <p className="text-ink-3">Loading…</p>
  if (error && !meeting) {
    return (
      <p className="rounded-md bg-[oklch(0.95_0.05_18)] p-3 text-sm text-rose-status">{error}</p>
    )
  }
  if (!meeting || !project) return null

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Link
            to={`/projects/${project.id}`}
            className="text-sm text-ink-3 hover:text-ink-2"
          >
            ← Back to project
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-ink">
            Draft review
          </h1>
          <p className="mt-1 text-sm text-ink-3">
            {new Date(meeting.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => navigate(`/projects/${project.id}`)}
          >
            Save & close
          </Button>
          <Button
            onClick={() =>
              navigate(`/projects/${project.id}/meetings/${meeting.id}/dispatch`)
            }
          >
            Approve & dispatch
          </Button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-[oklch(0.95_0.05_18)] p-3 text-sm text-rose-status">
          {error}
        </p>
      )}

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-ink">
          Minutes of meeting
        </h2>
        <Card className="p-4">
          <textarea
            value={momDraft}
            onChange={(e) => setMomDraft(e.target.value)}
            onBlur={saveMom}
            rows={6}
            placeholder="Summary will appear here."
            className="w-full resize-y rounded-md border border-line-2 px-3 py-2 text-sm leading-relaxed focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
          />
        </Card>
      </section>

      {meeting.taskUpdates && meeting.taskUpdates.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold text-ink">
            Tasks updated by this meeting
          </h2>
          <Card className="divide-y divide-line">
            {meeting.taskUpdates.map((u) => (
              <UpdateRow key={u.taskId} update={u} />
            ))}
          </Card>
          <p className="mt-2 text-xs text-ink-3">
            These changes have already been applied to the project. If something
            looks wrong, edit the task below.
          </p>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-ink">
          Participant emails
        </h2>
        <Card className="divide-y divide-line">
          {project.participants.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 p-3 text-sm"
            >
              <span className="w-32 shrink-0 font-medium text-ink-2">
                {p.name}
              </span>
              <input
                type="email"
                value={emails[p.id] ?? ''}
                onChange={(e) =>
                  setEmails((prev) => ({ ...prev, [p.id]: e.target.value }))
                }
                onBlur={() => saveEmail(p.id)}
                placeholder={`${p.name.toLowerCase()}@example.com`}
                className="flex-1 rounded-md border border-line-2 px-3 py-1.5 focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
              />
            </div>
          ))}
        </Card>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Tasks</h2>
          <Button variant="secondary" onClick={addTask}>
            + Add task
          </Button>
        </div>
        {tasks.length === 0 ? (
          <Card className="p-6 text-center text-ink-3">
            No tasks extracted. Add one manually if needed.
          </Card>
        ) : (
          <ul className="space-y-3">
            {tasks.map((t) => (
              <li key={t.id}>
                <TaskRow
                  task={t}
                  project={project}
                  otherTasks={tasks.filter((x) => x.id !== t.id)}
                  tasksById={tasksById}
                  onPatch={(patch) => patchTask(t.id, patch)}
                  onDelete={() => deleteTask(t.id)}
                  onAddAndAssign={addAndAssign}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function TaskRow({
  task,
  project,
  otherTasks,
  tasksById,
  onPatch,
  onDelete,
  onAddAndAssign,
}: {
  task: Task
  project: Project
  otherTasks: Task[]
  tasksById: Map<string, Task>
  onPatch: (patch: Partial<Task>) => void
  onDelete: () => void
  onAddAndAssign: (name: string) => Promise<void>
}) {
  const [description, setDescription] = useState(task.description)
  const [notes, setNotes] = useState(task.notes ?? '')
  const [showNotes, setShowNotes] = useState<boolean>(Boolean(task.notes))

  useEffect(() => {
    setDescription(task.description)
  }, [task.description])

  useEffect(() => {
    setNotes(task.notes ?? '')
    if (task.notes) setShowNotes(true)
  }, [task.notes])

  return (
    <Card className="p-4">
      <div className="space-y-3">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            if (description !== task.description) {
              onPatch({ description })
            }
          }}
          placeholder="What needs to happen?"
          className="w-full rounded-md border border-line-2 px-3 py-2 text-sm font-medium focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
        />
        {task.suggestedOwnerName && task.ownerParticipantId === null && (
          <SuggestionBanner
            name={task.suggestedOwnerName}
            onAddAndAssign={onAddAndAssign}
          />
        )}
        {showNotes ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              const next = notes.trim() || null
              const current = task.notes ?? null
              if (next !== current) onPatch({ notes: next })
            }}
            rows={2}
            placeholder="Notes (links, constraints, context)"
            className="w-full resize-y rounded-md border border-line bg-surface-2 px-3 py-1.5 text-xs leading-relaxed text-ink-2 focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="self-start text-xs text-ink-3 hover:text-ink"
          >
            + Add notes
          </button>
        )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-xs font-medium text-ink-3">
            Owner
            <select
              value={task.ownerParticipantId ?? ''}
              onChange={(e) =>
                onPatch({
                  ownerParticipantId: e.target.value || null,
                })
              }
              className="mt-1 w-full rounded-md border border-line-2 px-3 py-1.5 text-sm font-normal text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
            >
              <option value="">Unassigned</option>
              {project.participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-ink-3">
            Deadline
            <input
              type="date"
              value={task.deadline ?? ''}
              onChange={(e) => onPatch({ deadline: e.target.value || null })}
              className="mt-1 w-full rounded-md border border-line-2 px-3 py-1.5 text-sm font-normal text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
            />
          </label>
          <label className="text-xs font-medium text-ink-3">
            Status
            <select
              value={task.status}
              onChange={(e) =>
                onPatch({ status: e.target.value as Task['status'] })
              }
              className="mt-1 w-full rounded-md border border-line-2 px-3 py-1.5 text-sm font-normal text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
          </label>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-ink-3">
            Depends on
          </p>
          {otherTasks.length === 0 ? (
            <p className="text-xs italic text-ink-3">
              No other tasks in this meeting.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {otherTasks.map((other) => {
                const checked = task.dependsOn.includes(other.id)
                return (
                  <button
                    key={other.id}
                    type="button"
                    aria-pressed={checked}
                    onClick={() => {
                      const next = checked
                        ? task.dependsOn.filter((d) => d !== other.id)
                        : [...task.dependsOn, other.id]
                      onPatch({ dependsOn: next })
                    }}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      checked
                        ? 'border-accent bg-accent-soft text-accent-ink'
                        : 'border-line bg-surface text-ink-2 hover:bg-surface-2'
                    }`}
                  >
                    {other.description || '(untitled)'}
                  </button>
                )
              })}
            </div>
          )}
          {task.dependsOn.length > 0 && (
            <p className="mt-2 text-xs text-ink-3">
              Blocked by:{' '}
              {task.dependsOn
                .map((id) => tasksById.get(id)?.description || '(missing)')
                .join(', ')}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-xs text-ink-3">
            Owner: {task.ownerDisplayName}
          </span>
          <Button variant="ghost" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
    </Card>
  )
}

function SuggestionBanner({
  name,
  onAddAndAssign,
}: {
  name: string
  onAddAndAssign: (name: string) => Promise<void>
}) {
  const [submitting, setSubmitting] = useState(false)
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <span>
        ⚠ AI suggested <span className="font-semibold">"{name}"</span> for this
        task, but they aren't on the project yet.
      </span>
      <Button
        variant="secondary"
        disabled={submitting}
        onClick={async () => {
          setSubmitting(true)
          try {
            await onAddAndAssign(name)
          } finally {
            setSubmitting(false)
          }
        }}
      >
        {submitting ? 'Adding…' : `+ Add ${name} to project`}
      </Button>
    </div>
  )
}
