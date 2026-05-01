import { randomUUID } from 'node:crypto'
import {
  readJson,
  writeJson,
  readTasks,
  writeTasks,
  readTranscript,
} from '../storage.js'
import type { Meeting, Project, Task, TaskUpdate } from '../types.js'
import type {
  DialogueLine,
  ExistingTaskInput,
  ExtractedTaskDraft,
  ExtractedTaskUpdate,
} from './extract.js'
import { extractTasks } from './extract.js'
import { findDuplicateExisting } from './dedupeTasks.js'

const MEETINGS_FILE = 'meetings.json'
const PROJECTS_FILE = 'projects.json'

async function updateMeeting(
  meetingId: string,
  patch: Partial<Meeting>,
): Promise<void> {
  const meetings = await readJson<Meeting[]>(MEETINGS_FILE, [])
  const idx = meetings.findIndex((m) => m.id === meetingId)
  if (idx < 0) return
  meetings[idx] = { ...meetings[idx], ...patch }
  await writeJson(MEETINGS_FILE, meetings)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function buildDialogue(
  meeting: Meeting,
  transcriptSegments: { speaker: string; start: number; end: number; text: string }[],
): DialogueLine[] {
  const map = meeting.speakerMap ?? {}
  return transcriptSegments.map((s) => ({
    speaker: map[s.speaker]?.displayName ?? s.speaker,
    start: s.start,
    end: s.end,
    text: s.text,
  }))
}

function materializeTasks(
  drafts: ExtractedTaskDraft[],
  project: Project,
  meetingId: string,
): Task[] {
  const roster = new Map(project.participants.map((p) => [p.id, p]))
  const now = new Date().toISOString()

  const tempToReal = new Map<string, string>()
  for (const d of drafts) {
    tempToReal.set(d.tempId, randomUUID())
  }

  return drafts.map((d) => {
    const ownerId =
      d.ownerParticipantId && roster.has(d.ownerParticipantId)
        ? d.ownerParticipantId
        : null
    const ownerName = ownerId
      ? (roster.get(ownerId)?.name ?? 'Unassigned')
      : 'Unassigned'

    const dependsOn = d.dependsOn
      .map((t) => tempToReal.get(t))
      .filter((x): x is string => Boolean(x))

    return {
      id: tempToReal.get(d.tempId)!,
      projectId: project.id,
      sourceMeetingId: meetingId,
      description: d.description,
      ownerParticipantId: ownerId,
      ownerDisplayName: ownerName,
      status: 'pending',
      deadline: d.deadline,
      dependsOn,
      createdAt: now,
      updatedAt: now,
    }
  })
}

function buildExistingTaskInputs(
  projectTasks: Task[],
  currentMeetingId: string,
  meetingsById: Map<string, Meeting>,
): ExistingTaskInput[] {
  return projectTasks
    .filter((t) => t.sourceMeetingId !== currentMeetingId)
    .map((t) => ({
      id: t.id,
      description: t.description,
      ownerDisplayName: t.ownerDisplayName,
      deadline: t.deadline,
      status: t.status,
      sourceMeetingDate:
        meetingsById.get(t.sourceMeetingId)?.createdAt.slice(0, 10) ??
        t.createdAt.slice(0, 10),
    }))
}

function applyUpdates(
  allTasks: Task[],
  updates: ExtractedTaskUpdate[],
  projectId: string,
): { updatedTasks: Task[]; updateRecords: TaskUpdate[] } {
  const now = new Date().toISOString()
  const tasksById = new Map(allTasks.map((t) => [t.id, t]))
  const updateRecords: TaskUpdate[] = []
  const next = [...allTasks]

  for (const u of updates) {
    const idx = next.findIndex((t) => t.id === u.taskId)
    if (idx < 0) continue
    const target = next[idx]
    if (target.projectId !== projectId) continue

    const before = { status: target.status, deadline: target.deadline }
    const nextStatus = u.status ?? target.status
    const statusChanged = u.status !== null && u.status !== target.status

    // Guard against the LLM clearing a deadline as a side-effect of closing a task.
    // If the model also flipped status AND emitted deadline: null while there was an
    // existing deadline, treat the null as "unchanged" — only respect explicit clears
    // when they come on their own.
    let nextDeadline: string | null
    if (u.deadline === undefined) {
      nextDeadline = target.deadline
    } else if (
      u.deadline === null &&
      statusChanged &&
      target.deadline !== null
    ) {
      console.log(
        `[extract] suppressed deadline-clear on ${target.id} (paired with status change)`,
      )
      nextDeadline = target.deadline
    } else {
      nextDeadline = u.deadline
    }

    if (
      nextStatus === before.status &&
      nextDeadline === before.deadline
    ) {
      continue
    }

    next[idx] = {
      ...target,
      status: nextStatus,
      deadline: nextDeadline,
      updatedAt: now,
    }
    updateRecords.push({
      taskId: target.id,
      description: target.description,
      before,
      after: { status: nextStatus, deadline: nextDeadline },
    })
  }

  // Suppress unused-warning helper (tasksById kept in case future logic needs lookup)
  void tasksById

  return { updatedTasks: next, updateRecords }
}

export async function runExtraction(meetingId: string): Promise<void> {
  try {
    const meetings = await readJson<Meeting[]>(MEETINGS_FILE, [])
    const meeting = meetings.find((m) => m.id === meetingId)
    if (!meeting) {
      console.error(`[extract] meeting ${meetingId} not found`)
      return
    }
    const projects = await readJson<Project[]>(PROJECTS_FILE, [])
    const project = projects.find((p) => p.id === meeting.projectId)
    if (!project) {
      throw new Error(`project ${meeting.projectId} not found`)
    }
    const transcript = await readTranscript(meetingId)
    if (!transcript) {
      throw new Error('transcript not ready — run transcription first')
    }

    await updateMeeting(meetingId, {
      status: 'extracting',
      extractionError: null,
    })

    const dialogue = buildDialogue(meeting, transcript.segments)
    console.log(`[extract] extracting ${dialogue.length} dialogue lines`)

    const allTasksBefore = await readTasks()
    const projectTasks = allTasksBefore.filter(
      (t) => t.projectId === project.id,
    )
    const meetingsById = new Map(meetings.map((m) => [m.id, m]))
    const existingTasks = buildExistingTaskInputs(
      projectTasks,
      meetingId,
      meetingsById,
    )
    console.log(
      `[extract] passing ${existingTasks.length} existing tasks as context`,
    )

    const result = await extractTasks({
      today: todayIso(),
      participants: project.participants.map((p) => ({
        id: p.id,
        name: p.name,
      })),
      existingTasks,
      dialogue,
    })
    console.log(
      `[extract] ok: ${result.tasks.length} new tasks, ${result.updates.length} updates, mom length=${result.mom.length}`,
    )

    // Dedupe: drop new tasks that the LLM emitted despite already existing.
    // Synthesize a status-only update if the LLM didn't already cover that taskId.
    const participantNameById = new Map(
      project.participants.map((p) => [p.id, p.name]),
    )
    const dedupedTasks: ExtractedTaskDraft[] = []
    const synthUpdates: ExtractedTaskUpdate[] = [...result.updates]
    const knownUpdateIds = new Set(result.updates.map((u) => u.taskId))
    let droppedCount = 0
    for (const t of result.tasks) {
      const ownerName =
        t.ownerParticipantId &&
        participantNameById.get(t.ownerParticipantId)
          ? participantNameById.get(t.ownerParticipantId)!
          : null
      const dup = findDuplicateExisting(
        ownerName,
        t.description,
        existingTasks,
      )
      if (!dup) {
        dedupedTasks.push(t)
        continue
      }
      droppedCount++
      if (knownUpdateIds.has(dup.id)) continue
      const update: ExtractedTaskUpdate = {
        taskId: dup.id,
        status: null,
        deadline:
          t.deadline && t.deadline !== dup.deadline ? t.deadline : undefined,
      }
      synthUpdates.push(update)
      knownUpdateIds.add(dup.id)
    }
    if (droppedCount > 0) {
      console.log(
        `[dedupe] dropped ${droppedCount} duplicate task${droppedCount === 1 ? '' : 's'}, total updates=${synthUpdates.length}`,
      )
    }
    result.tasks = dedupedTasks
    result.updates = synthUpdates

    // Validate updates: drop hallucinated ids and any pointing outside the project
    const validIds = new Set(existingTasks.map((t) => t.id))
    const validUpdates = result.updates.filter((u) => validIds.has(u.taskId))

    // 1) Apply updates to all tasks (in-memory copy)
    const { updatedTasks, updateRecords } = applyUpdates(
      allTasksBefore,
      validUpdates,
      project.id,
    )

    // 2) Wipe this meeting's previous task creations and append fresh ones
    const newTasks = materializeTasks(result.tasks, project, meetingId)
    const filtered = updatedTasks.filter(
      (t) => t.sourceMeetingId !== meetingId,
    )
    await writeTasks([...filtered, ...newTasks])

    await updateMeeting(meetingId, {
      status: 'draft',
      mom: result.mom,
      extractedAt: new Date().toISOString(),
      extractionError: null,
      taskUpdates: updateRecords,
    })
    console.log(
      `[extract] ${meetingId} draft ready (${updateRecords.length} updates applied)`,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[extract] failed for ${meetingId}:`, message)
    await updateMeeting(meetingId, {
      status: 'extraction_failed',
      extractionError: message,
    })
  }
}
