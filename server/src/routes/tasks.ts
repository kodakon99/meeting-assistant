import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { readJson, readTasks, writeTasks } from '../storage.js'
import type { Meeting, Project, Task, TaskStatus } from '../types.js'

const router = Router()

const MEETINGS_FILE = 'meetings.json'
const PROJECTS_FILE = 'projects.json'

async function resolveOwnerName(
  projectId: string,
  ownerParticipantId: string | null,
): Promise<string> {
  if (!ownerParticipantId) return 'Unassigned'
  const projects = await readJson<Project[]>(PROJECTS_FILE, [])
  const project = projects.find((p) => p.id === projectId)
  const participant = project?.participants.find(
    (p) => p.id === ownerParticipantId,
  )
  return participant?.name ?? 'Unassigned'
}

router.get('/meetings/:meetingId/tasks', async (req, res) => {
  const tasks = await readTasks()
  res.json(tasks.filter((t) => t.sourceMeetingId === req.params.meetingId))
})

router.get('/projects/:projectId/tasks', async (req, res) => {
  const tasks = await readTasks()
  res.json(tasks.filter((t) => t.projectId === req.params.projectId))
})

router.post('/meetings/:meetingId/tasks', async (req, res) => {
  const meetings = await readJson<Meeting[]>(MEETINGS_FILE, [])
  const meeting = meetings.find((m) => m.id === req.params.meetingId)
  if (!meeting) return res.status(404).json({ error: 'meeting not found' })

  const body = req.body as Partial<Task> | undefined
  const ownerParticipantId =
    typeof body?.ownerParticipantId === 'string' ? body.ownerParticipantId : null
  const ownerDisplayName = await resolveOwnerName(
    meeting.projectId,
    ownerParticipantId,
  )

  const now = new Date().toISOString()
  const task: Task = {
    id: randomUUID(),
    projectId: meeting.projectId,
    sourceMeetingId: meeting.id,
    description:
      typeof body?.description === 'string' ? body.description : '',
    ownerParticipantId,
    ownerDisplayName,
    status: 'pending',
    deadline:
      typeof body?.deadline === 'string' && body.deadline ? body.deadline : null,
    dependsOn: Array.isArray(body?.dependsOn) ? body.dependsOn : [],
    createdAt: now,
    updatedAt: now,
  }
  const tasks = await readTasks()
  tasks.push(task)
  await writeTasks(tasks)
  res.status(201).json(task)
})

router.patch('/tasks/:taskId', async (req, res) => {
  const tasks = await readTasks()
  const idx = tasks.findIndex((t) => t.id === req.params.taskId)
  if (idx < 0) return res.status(404).json({ error: 'task not found' })
  const existing = tasks[idx]
  const body = req.body as Partial<Task> | undefined

  const patch: Partial<Task> = {}
  if (typeof body?.description === 'string') patch.description = body.description
  if (body && 'ownerParticipantId' in body) {
    const raw = body.ownerParticipantId
    patch.ownerParticipantId =
      typeof raw === 'string' && raw ? raw : null
    patch.ownerDisplayName = await resolveOwnerName(
      existing.projectId,
      patch.ownerParticipantId,
    )
    if (patch.ownerParticipantId !== null) {
      patch.suggestedOwnerName = null
    }
  }
  if (body && 'deadline' in body) {
    const raw = body.deadline
    patch.deadline =
      typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
  }
  if (Array.isArray(body?.dependsOn)) {
    patch.dependsOn = body.dependsOn.filter(
      (x): x is string => typeof x === 'string' && x !== existing.id,
    )
  }
  if (typeof body?.status === 'string') {
    const allowed: TaskStatus[] = ['pending', 'in_progress', 'done']
    if (allowed.includes(body.status as TaskStatus)) {
      patch.status = body.status as TaskStatus
    }
  }
  if (body && 'notes' in body) {
    const raw = body.notes
    patch.notes = typeof raw === 'string' ? raw : null
  }

  tasks[idx] = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  await writeTasks(tasks)
  res.json(tasks[idx])
})

router.delete('/tasks/:taskId', async (req, res) => {
  const tasks = await readTasks()
  const target = tasks.find((t) => t.id === req.params.taskId)
  if (!target) return res.status(404).json({ error: 'task not found' })

  const remaining = tasks
    .filter((t) => t.id !== target.id)
    .map((t) =>
      t.dependsOn.includes(target.id)
        ? {
            ...t,
            dependsOn: t.dependsOn.filter((d) => d !== target.id),
            updatedAt: new Date().toISOString(),
          }
        : t,
    )
  await writeTasks(remaining)
  res.status(204).end()
})

export default router
