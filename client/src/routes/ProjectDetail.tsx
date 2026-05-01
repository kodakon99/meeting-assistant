import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { Meeting, MeetingStatus, Project, Task, TaskStatus } from '../lib/types'
import { ProjectTabs } from '../components/ProjectTabs'
import { LiveRecorder } from '../components/animated/LiveRecorder'
import { ProjectStats } from '../components/animated/ProjectStats'
import { TaskViewToggle } from '../components/animated/TaskViewToggle'
import { MeetingItem } from '../components/animated/MeetingItem'

const POLLABLE: MeetingStatus[] = [
  'uploaded',
  'transcribing',
  'speakers_confirmed',
  'extracting',
]

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    Promise.all([
      api.getProject(id),
      api.listMeetings(id),
      api.listProjectTasks(id),
    ])
      .then(([p, m, t]) => {
        if (cancelled) return
        setProject(p)
        setMeetings(m)
        setTasks(t)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    const pollableIds = meetings
      .filter((m) => POLLABLE.includes(m.status))
      .map((m) => m.id)

    if (pollableIds.length === 0) {
      if (pollRef.current) {
        window.clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }

    if (pollRef.current) return

    pollRef.current = window.setInterval(async () => {
      try {
        const updates = await Promise.all(
          pollableIds.map((mid) => api.getMeeting(mid)),
        )
        setMeetings((prev) =>
          prev.map((m) => updates.find((u) => u.id === m.id) ?? m),
        )
      } catch {
        // swallow
      }
    }, 3000)

    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [meetings])

  async function handleDeleteMeeting(meetingId: string) {
    if (
      !window.confirm(
        'Delete this meeting? This removes its audio, transcript, and any tasks it created.',
      )
    ) {
      return
    }
    const snapshot = meetings
    setMeetings((prev) => prev.filter((m) => m.id !== meetingId))
    try {
      await api.deleteMeeting(meetingId)
      if (id) {
        const fresh = await api.listProjectTasks(id)
        setTasks(fresh)
      }
    } catch (e) {
      setMeetings(snapshot)
      setError((e as Error).message)
    }
  }

  async function handleDeleteProject() {
    if (!project) return
    if (
      !window.confirm(
        'Delete this project? This permanently removes the project, all its meetings, audio recordings, transcripts, and tasks. Notion rows for these tasks will NOT be removed from Notion automatically.',
      )
    ) {
      return
    }
    try {
      await api.deleteProject(project.id)
      navigate('/')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleToggleTask(taskId: string, nextStatus: TaskStatus) {
    const snapshot = tasks
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)),
    )
    try {
      await api.updateTask(taskId, { status: nextStatus })
    } catch (e) {
      setTasks(snapshot)
      setError((e as Error).message)
    }
  }

  function handleMeetingCreated(m: Meeting) {
    setMeetings((prev) => [m, ...prev])
  }

  if (error) {
    return (
      <p className="rounded-card bg-[oklch(0.95_0.05_18)] p-3 text-[13px] text-rose-status">
        {error}
      </p>
    )
  }
  if (!project) return <p className="text-ink-3">Loading…</p>

  return (
    <div className="flex flex-col gap-7">
      <ProjectTabs project={project} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-[26px] font-semibold tracking-tight text-ink">
            {project.name}
          </h1>
          <p className="mt-1 text-[13px] text-ink-3 m-0">
            {project.participants.length}{' '}
            {project.participants.length === 1
              ? 'participant'
              : 'participants'}
            {project.participants.length > 0 && ' · '}
            {project.participants.map((p) => p.name).join(', ')}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDeleteProject}
          className="text-[11px] text-ink-3 hover:text-rose-status transition-colors"
        >
          Delete project
        </button>
      </div>

      <LiveRecorder project={project} onMeetingCreated={handleMeetingCreated} />

      <ProjectStats tasks={tasks} participants={project.participants} />

      <TaskViewToggle tasks={tasks} onToggleDone={handleToggleTask} />

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-[17px] font-semibold tracking-tight text-ink">
          Meetings
        </h2>
        {meetings.length === 0 ? (
          <div className="bg-surface border border-line rounded-card p-6 text-center text-ink-3 text-[13px]">
            No meetings yet — record above to capture your first one.
          </div>
        ) : (
          <ul className="flex flex-col gap-2 m-0 p-0 list-none">
            {meetings.map((m, i) => (
              <MeetingItem
                key={m.id}
                meeting={m}
                projectId={project.id}
                onDelete={handleDeleteMeeting}
                index={i}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
