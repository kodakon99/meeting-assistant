import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { Project } from '../lib/types'
import { LiveRecorder } from '../components/animated/LiveRecorder'

export function NewMeeting() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    api
      .getProject(id)
      .then((p) => {
        if (!cancelled) setProject(p)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [id])

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
      <div>
        <h1 className="m-0 text-[22px] font-semibold tracking-tight text-ink">
          New meeting
        </h1>
        <p className="mt-1 text-[13px] text-ink-3">
          Capture a meeting for {project.name}. We'll transcribe, identify
          speakers, and draft tasks for you.
        </p>
      </div>
      <LiveRecorder project={project} />
    </div>
  )
}
