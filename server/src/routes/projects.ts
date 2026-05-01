import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import {
  readJson,
  writeJson,
  readTasks,
  writeTasks,
} from '../storage.js'
import type { Meeting, Project } from '../types.js'
import { deleteMeetingArtifacts } from './meetings.js'

const router = Router()
const FILE = 'projects.json'
const MEETINGS_FILE = 'meetings.json'

async function loadProjects(): Promise<Project[]> {
  return readJson<Project[]>(FILE, [])
}

router.get('/', async (_req, res) => {
  const projects = await loadProjects()
  res.json(projects)
})

router.post('/', async (req, res) => {
  const { name, participantNames } = req.body as {
    name?: string
    participantNames?: string[]
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name required' })
  }
  const names = Array.isArray(participantNames) ? participantNames : []
  const project: Project = {
    id: randomUUID(),
    name: name.trim(),
    participants: names
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => ({ id: randomUUID(), name: n, email: null })),
    createdAt: new Date().toISOString(),
  }
  const projects = await loadProjects()
  projects.push(project)
  await writeJson(FILE, projects)
  res.status(201).json(project)
})

router.get('/:id', async (req, res) => {
  const projects = await loadProjects()
  const project = projects.find((p) => p.id === req.params.id)
  if (!project) return res.status(404).json({ error: 'not found' })
  res.json(project)
})

router.post('/:projectId/participants', async (req, res) => {
  const projects = await loadProjects()
  const idx = projects.findIndex((p) => p.id === req.params.projectId)
  if (idx < 0) return res.status(404).json({ error: 'project not found' })

  const body = req.body as { name?: string } | undefined
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return res.status(400).json({ error: 'name required' })

  const existing = projects[idx].participants.find(
    (p) => p.name.trim().toLowerCase() === name.toLowerCase(),
  )
  if (existing) {
    // Idempotent: name already on roster, return unchanged
    return res.status(200).json(projects[idx])
  }

  projects[idx] = {
    ...projects[idx],
    participants: [
      ...projects[idx].participants,
      { id: randomUUID(), name, email: null },
    ],
  }
  await writeJson(FILE, projects)
  res.status(201).json(projects[idx])
})

router.patch('/:projectId/participants/:participantId', async (req, res) => {
  const projects = await loadProjects()
  const pIdx = projects.findIndex((p) => p.id === req.params.projectId)
  if (pIdx < 0) return res.status(404).json({ error: 'project not found' })
  const participantIdx = projects[pIdx].participants.findIndex(
    (x) => x.id === req.params.participantId,
  )
  if (participantIdx < 0) {
    return res.status(404).json({ error: 'participant not found' })
  }

  const body = req.body as { email?: string | null } | undefined
  const raw = body?.email
  const email =
    typeof raw === 'string' && raw.trim() ? raw.trim() : null

  projects[pIdx].participants[participantIdx] = {
    ...projects[pIdx].participants[participantIdx],
    email,
  }
  await writeJson(FILE, projects)
  res.json(projects[pIdx])
})

router.delete('/:projectId', async (req, res) => {
  const projects = await loadProjects()
  const idx = projects.findIndex((p) => p.id === req.params.projectId)
  if (idx < 0) return res.status(404).json({ error: 'project not found' })

  // 1. Best-effort delete audio + transcript for every meeting on this project
  const meetings = await readJson<Meeting[]>(MEETINGS_FILE, [])
  const projectMeetings = meetings.filter(
    (m) => m.projectId === req.params.projectId,
  )
  for (const m of projectMeetings) {
    await deleteMeetingArtifacts(m)
  }

  // 2. Remove meetings for this project
  const remainingMeetings = meetings.filter(
    (m) => m.projectId !== req.params.projectId,
  )
  if (remainingMeetings.length !== meetings.length) {
    await writeJson(MEETINGS_FILE, remainingMeetings)
  }

  // 3. Remove all tasks for this project
  const tasks = await readTasks()
  const remainingTasks = tasks.filter(
    (t) => t.projectId !== req.params.projectId,
  )
  if (remainingTasks.length !== tasks.length) {
    await writeTasks(remainingTasks)
  }

  // 4. Remove the project record
  projects.splice(idx, 1)
  await writeJson(FILE, projects)

  res.status(204).end()
})

export default router
