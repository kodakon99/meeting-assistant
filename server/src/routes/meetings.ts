import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import {
  readJson,
  writeJson,
  readTranscript,
  readTasks,
  writeTasks,
  deleteTranscript,
  UPLOADS_DIR,
} from '../storage.js'
import type {
  DraftTask,
  DraftUpdate,
  Meeting,
  Project,
  SpeakerAssignment,
  Task,
  TaskUpdate,
} from '../types.js'
import { runPipeline } from '../pipeline/runPipeline.js'
import { runExtraction } from '../pipeline/runExtraction.js'
import { runDispatch } from '../pipeline/dispatch.js'
import { buildEmails } from '../pipeline/buildEmails.js'
import { buildSlackPreviews } from '../pipeline/dispatchSlack.js'
import { buildNotionPreviews } from '../pipeline/dispatchNotion.js'

const router = Router()

const MEETINGS_FILE = 'meetings.json'
const PROJECTS_FILE = 'projects.json'
const MAX_BYTES = 50 * 1024 * 1024 // 50 MB — plenty for 6 min of compressed audio

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('audio/')) {
      return cb(new Error('Only audio files are allowed'))
    }
    cb(null, true)
  },
})

function extFromMime(mime: string): string {
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a'
  if (mime.includes('mpeg')) return 'mp3'
  if (mime.includes('wav')) return 'wav'
  if (mime.includes('ogg')) return 'ogg'
  return 'bin'
}

router.get('/projects/:projectId/meetings', async (req, res) => {
  const meetings = await readJson<Meeting[]>(MEETINGS_FILE, [])
  res.json(meetings.filter((m) => m.projectId === req.params.projectId))
})

router.post(
  '/projects/:projectId/meetings',
  upload.single('audio'),
  async (req, res) => {
    const projects = await readJson<Project[]>(PROJECTS_FILE, [])
    const project = projects.find((p) => p.id === req.params.projectId)
    if (!project) return res.status(404).json({ error: 'project not found' })

    const file = req.file
    if (!file) return res.status(400).json({ error: 'audio file required' })

    const durationRaw = req.body?.durationSeconds
    const durationSeconds =
      typeof durationRaw === 'string' && durationRaw.length > 0
        ? Number(durationRaw)
        : null

    const meetingId = randomUUID()
    const ext = extFromMime(file.mimetype)
    const filename = `${meetingId}.${ext}`
    await fs.writeFile(path.join(UPLOADS_DIR, filename), file.buffer)

    const meeting: Meeting = {
      id: meetingId,
      projectId: project.id,
      audioFilename: filename,
      audioMimeType: file.mimetype,
      audioSizeBytes: file.size,
      durationSeconds:
        durationSeconds != null && Number.isFinite(durationSeconds)
          ? durationSeconds
          : null,
      status: 'uploaded',
      createdAt: new Date().toISOString(),
    }
    const meetings = await readJson<Meeting[]>(MEETINGS_FILE, [])
    meetings.push(meeting)
    await writeJson(MEETINGS_FILE, meetings)

    // Fire-and-forget: kick off transcription pipeline in background
    void runPipeline(meetingId).catch((err) =>
      console.error('[pipeline] unhandled error:', err),
    )

    res.status(201).json(meeting)
  },
)

router.get('/meetings/:meetingId', async (req, res) => {
  const meetings = await readJson<Meeting[]>(MEETINGS_FILE, [])
  const meeting = meetings.find((m) => m.id === req.params.meetingId)
  if (!meeting) return res.status(404).json({ error: 'not found' })
  res.json(meeting)
})

router.get('/meetings/:meetingId/transcript', async (req, res) => {
  const transcript = await readTranscript(req.params.meetingId)
  if (!transcript) return res.status(404).json({ error: 'not ready' })
  res.json(transcript)
})

router.post('/meetings/:meetingId/speaker-map', async (req, res) => {
  const meetings = await readJson<Meeting[]>(MEETINGS_FILE, [])
  const idx = meetings.findIndex((m) => m.id === req.params.meetingId)
  if (idx < 0) return res.status(404).json({ error: 'meeting not found' })
  const meeting = meetings[idx]

  const assignments = (req.body?.assignments ?? {}) as Record<
    string,
    { participantId: string | null }
  >
  const detectedSpeakers = meeting.detectedSpeakers ?? []
  if (detectedSpeakers.length === 0) {
    return res.status(400).json({ error: 'no detected speakers on meeting' })
  }
  for (const sp of detectedSpeakers) {
    if (!(sp in assignments)) {
      return res.status(400).json({ error: `missing assignment for ${sp}` })
    }
  }

  const projects = await readJson<Project[]>(PROJECTS_FILE, [])
  const project = projects.find((p) => p.id === meeting.projectId)
  const participantsById = new Map(
    (project?.participants ?? []).map((p) => [p.id, p]),
  )

  const speakerMap: Record<string, SpeakerAssignment> = {}
  const nameCounts = new Map<string, number>()
  const nameTotals = new Map<string, number>()
  for (const sp of detectedSpeakers) {
    const pid = assignments[sp]?.participantId ?? null
    const name = pid ? (participantsById.get(pid)?.name ?? 'Unknown') : null
    if (name) nameTotals.set(name, (nameTotals.get(name) ?? 0) + 1)
  }
  let unknownIdx = 0
  for (const sp of detectedSpeakers) {
    const pid = assignments[sp]?.participantId ?? null
    if (pid) {
      const participant = participantsById.get(pid)
      const baseName = participant?.name ?? 'Unknown'
      const total = nameTotals.get(baseName) ?? 1
      const count = (nameCounts.get(baseName) ?? 0) + 1
      nameCounts.set(baseName, count)
      const displayName = total > 1 ? `${baseName} #${count}` : baseName
      speakerMap[sp] = { participantId: pid, displayName }
    } else {
      const letter = String.fromCharCode('A'.charCodeAt(0) + unknownIdx++)
      speakerMap[sp] = {
        participantId: null,
        displayName: `Person ${letter}`,
      }
    }
  }

  // Has the new combined-pass flow already produced drafts?
  const hasDrafts =
    Array.isArray(meeting.tasksDraft) ||
    Array.isArray(meeting.updatesDraft) ||
    typeof meeting.momDraft === 'string'

  if (hasDrafts) {
    // A1 fast path: materialize drafts in-process. No second LLM call.
    try {
      const finalized = await finalizeFromDrafts(meeting, project!, speakerMap)
      meetings[idx] = finalized
      await writeJson(MEETINGS_FILE, meetings)
      return res.json(meetings[idx])
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[speaker-map] finalize failed:', message)
      meetings[idx] = {
        ...meeting,
        speakerMap,
        status: 'extraction_failed',
        extractionError: message,
      }
      await writeJson(MEETINGS_FILE, meetings)
      return res.json(meetings[idx])
    }
  }

  // Legacy fallback: meetings created before A1 don't have drafts. Run the old
  // two-phase pipeline one last time so historical records still work.
  meetings[idx] = {
    ...meeting,
    speakerMap,
    status: 'speakers_confirmed',
  }
  await writeJson(MEETINGS_FILE, meetings)

  void runExtraction(meetings[idx].id).catch((err) =>
    console.error('[extract] unhandled error:', err),
  )

  res.json(meetings[idx])
})

router.get('/meetings/:meetingId/dispatch-preview', async (req, res) => {
  const meetings = await readJson<Meeting[]>(MEETINGS_FILE, [])
  const meeting = meetings.find((m) => m.id === req.params.meetingId)
  if (!meeting) return res.status(404).json({ error: 'meeting not found' })

  const projects = await readJson<Project[]>(PROJECTS_FILE, [])
  const project = projects.find((p) => p.id === meeting.projectId)
  if (!project) return res.status(404).json({ error: 'project not found' })

  const allTasks = await readTasks()
  const projectTasks: Task[] = allTasks.filter(
    (t) => t.projectId === project.id,
  )

  const emails = buildEmails(meeting, project, projectTasks)
  const slackMessages = buildSlackPreviews(project, projectTasks)
  const notionRows = buildNotionPreviews(meeting, projectTasks)

  res.json({
    emails,
    slackMessages,
    notionRows,
    integrationsConfigured: {
      slack: Boolean(
        process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID,
      ),
      notion: Boolean(
        process.env.NOTION_API_KEY && process.env.NOTION_DATABASE_ID,
      ),
    },
  })
})

router.post('/meetings/:meetingId/dispatch', async (req, res) => {
  const meetings = await readJson<Meeting[]>(MEETINGS_FILE, [])
  const idx = meetings.findIndex((m) => m.id === req.params.meetingId)
  if (idx < 0) return res.status(404).json({ error: 'meeting not found' })
  const meeting = meetings[idx]

  if (meeting.status !== 'draft' && meeting.status !== 'dispatched') {
    return res.status(400).json({
      error: `meeting is not ready to dispatch (status: ${meeting.status})`,
    })
  }

  const projects = await readJson<Project[]>(PROJECTS_FILE, [])
  const project = projects.find((p) => p.id === meeting.projectId)
  if (!project) return res.status(404).json({ error: 'project not found' })

  const allTasks = await readTasks()
  const projectTasks: Task[] = allTasks.filter(
    (t) => t.projectId === project.id,
  )

  const { emails, result } = await runDispatch(meeting, project, projectTasks)

  meetings[idx] = {
    ...meeting,
    status: 'dispatched',
    dispatch: result,
  }
  await writeJson(MEETINGS_FILE, meetings)

  res.json({ meeting: meetings[idx], emails })
})

router.patch('/meetings/:meetingId', async (req, res) => {
  const meetings = await readJson<Meeting[]>(MEETINGS_FILE, [])
  const idx = meetings.findIndex((m) => m.id === req.params.meetingId)
  if (idx < 0) return res.status(404).json({ error: 'meeting not found' })

  const body = req.body as Partial<Meeting> | undefined
  const patch: Partial<Meeting> = {}
  if (body && 'mom' in body) {
    patch.mom = typeof body.mom === 'string' ? body.mom : null
  }
  meetings[idx] = { ...meetings[idx], ...patch }
  await writeJson(MEETINGS_FILE, meetings)
  res.json(meetings[idx])
})

router.get('/meetings/:meetingId/audio', async (req, res) => {
  const meetings = await readJson<Meeting[]>(MEETINGS_FILE, [])
  const meeting = meetings.find((m) => m.id === req.params.meetingId)
  if (!meeting) return res.status(404).json({ error: 'meeting not found' })
  const filePath = path.join(UPLOADS_DIR, meeting.audioFilename)
  try {
    await fs.access(filePath)
  } catch {
    return res.status(404).json({ error: 'audio file not found' })
  }
  res.setHeader('Content-Type', meeting.audioMimeType || 'audio/webm')
  res.sendFile(filePath)
})

export async function deleteMeetingArtifacts(meeting: Meeting): Promise<void> {
  // Best-effort: audio file + transcript file
  try {
    await fs.unlink(path.join(UPLOADS_DIR, meeting.audioFilename))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[meetings] audio unlink failed:', err)
    }
  }
  await deleteTranscript(meeting.id)
}

router.delete('/meetings/:meetingId', async (req, res) => {
  const meetings = await readJson<Meeting[]>(MEETINGS_FILE, [])
  const idx = meetings.findIndex((m) => m.id === req.params.meetingId)
  if (idx < 0) return res.status(404).json({ error: 'meeting not found' })
  const meeting = meetings[idx]

  // 1. Cascade-delete tasks created by this meeting
  const tasks = await readTasks()
  const remaining = tasks.filter((t) => t.sourceMeetingId !== meeting.id)
  if (remaining.length !== tasks.length) {
    await writeTasks(remaining)
  }

  // 2. Best-effort remove audio file + transcript
  await deleteMeetingArtifacts(meeting)

  // 3. Remove the meeting record
  meetings.splice(idx, 1)
  await writeJson(MEETINGS_FILE, meetings)

  res.status(204).end()
})

function resolveOwner(
  ownerName: string | null,
  speakerMap: Record<string, SpeakerAssignment>,
  project: Project,
): { participantId: string | null; displayName: string } {
  if (!ownerName) return { participantId: null, displayName: 'Unassigned' }
  const trimmed = ownerName.trim()
  if (!trimmed) return { participantId: null, displayName: 'Unassigned' }
  if (/^Speaker\s+\d+$/i.test(trimmed)) {
    const a = speakerMap[trimmed]
    if (a?.participantId) {
      const p = project.participants.find((x) => x.id === a.participantId)
      return {
        participantId: a.participantId,
        displayName: p?.name ?? 'Unassigned',
      }
    }
    return { participantId: null, displayName: 'Unassigned' }
  }
  const match = project.participants.find(
    (p) => p.name.toLowerCase() === trimmed.toLowerCase(),
  )
  return match
    ? { participantId: match.id, displayName: match.name }
    : { participantId: null, displayName: 'Unassigned' }
}

async function finalizeFromDrafts(
  meeting: Meeting,
  project: Project,
  speakerMap: Record<string, SpeakerAssignment>,
): Promise<Meeting> {
  const now = new Date().toISOString()

  // 1) Materialize new tasks from draft
  const drafts = meeting.tasksDraft ?? []
  const tempToReal = new Map<string, string>()
  for (const d of drafts) tempToReal.set(d.tempId, randomUUID())

  const newTasks: Task[] = drafts.map((d: DraftTask) => {
    const owner = resolveOwner(d.ownerName, speakerMap, project)
    const dependsOn = d.dependsOn
      .map((t) => tempToReal.get(t))
      .filter((x): x is string => Boolean(x))
    const looksLikeRosterName =
      d.ownerName !== null &&
      typeof d.ownerName === 'string' &&
      !/^Speaker\s+\d+$/i.test(d.ownerName.trim())
    const suggestedOwnerName =
      owner.participantId === null && looksLikeRosterName
        ? d.ownerName!.trim()
        : null
    return {
      id: tempToReal.get(d.tempId)!,
      projectId: project.id,
      sourceMeetingId: meeting.id,
      description: d.description,
      ownerParticipantId: owner.participantId,
      ownerDisplayName: owner.displayName,
      status: 'pending',
      deadline: d.deadline,
      dependsOn,
      createdAt: now,
      updatedAt: now,
      suggestedOwnerName,
      notes: d.notes ?? null,
    }
  })

  // 2) Apply updates with the iter-5 deadline-clear suppression guard
  const allTasks = await readTasks()
  const validIds = new Set(
    allTasks.filter((t) => t.projectId === project.id).map((t) => t.id),
  )
  const taskUpdates: TaskUpdate[] = []
  const next = [...allTasks]

  for (const u of meeting.updatesDraft ?? []) {
    if (!validIds.has(u.taskId)) continue
    const idx = next.findIndex((t) => t.id === u.taskId)
    if (idx < 0) continue
    const target = next[idx]
    const before = { status: target.status, deadline: target.deadline }
    const nextStatus = u.status ?? target.status
    const statusChanged = u.status !== null && u.status !== target.status
    let nextDeadline: string | null
    if (u.deadline === undefined) {
      nextDeadline = target.deadline
    } else if (
      u.deadline === null &&
      statusChanged &&
      target.deadline !== null
    ) {
      console.log(
        `[speaker-map] suppressed deadline-clear on ${target.id} (paired with status change)`,
      )
      nextDeadline = target.deadline
    } else {
      nextDeadline = u.deadline as string | null
    }
    if (nextStatus === before.status && nextDeadline === before.deadline) {
      continue
    }
    next[idx] = {
      ...target,
      status: nextStatus,
      deadline: nextDeadline,
      updatedAt: now,
    }
    taskUpdates.push({
      taskId: target.id,
      description: target.description,
      before,
      after: { status: nextStatus, deadline: nextDeadline },
    })
  }

  // 3) Replace tasks owned by THIS meeting with the freshly materialized set
  const filtered = next.filter((t) => t.sourceMeetingId !== meeting.id)
  await writeTasks([...filtered, ...newTasks])

  // 4) Resolve "Speaker N" references in the MoM with displayNames
  const momDraft = meeting.momDraft ?? ''
  const mom = momDraft.replace(
    /Speaker\s+(\d+)/g,
    (match, n) => speakerMap[`Speaker ${n}`]?.displayName ?? match,
  )

  return {
    ...meeting,
    speakerMap,
    status: 'draft',
    mom,
    extractedAt: now,
    extractionError: null,
    taskUpdates,
    momDraft: null,
    tasksDraft: undefined,
    updatesDraft: undefined,
  }
}

export default router
