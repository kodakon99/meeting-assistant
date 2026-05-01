import {
  readJson,
  writeJson,
  writeTranscript,
  readTasks,
} from '../storage.js'
import type { Meeting, Project, Transcript } from '../types.js'
import { transcribeAudio } from './transcribe.js'
import { extractAllFromTranscript } from './extractAll.js'
import type { ExistingTaskInput } from './extract.js'
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

export async function runPipeline(meetingId: string): Promise<void> {
  try {
    const meetings = await readJson<Meeting[]>(MEETINGS_FILE, [])
    const meeting = meetings.find((m) => m.id === meetingId)
    if (!meeting) {
      console.error(`[pipeline] meeting ${meetingId} not found`)
      return
    }

    await updateMeeting(meetingId, {
      status: 'transcribing',
      transcriptionError: null,
    })

    const projects = await readJson<Project[]>(PROJECTS_FILE, [])
    const project = projects.find((p) => p.id === meeting.projectId)
    if (!project) {
      throw new Error(`project ${meeting.projectId} not found`)
    }

    console.log(`[pipeline] transcribing ${meeting.audioFilename}`)
    const whisper = await transcribeAudio(meeting.audioFilename)
    console.log(
      `[pipeline] whisper ok: ${whisper.segments.length} segments, lang=${whisper.language}`,
    )

    // Build context for the combined extract pass
    const allTasks = await readTasks()
    const projectTasks = allTasks.filter((t) => t.projectId === project.id)
    const meetingsById = new Map(meetings.map((m) => [m.id, m]))
    const existingTasks: ExistingTaskInput[] = projectTasks
      .filter((t) => t.sourceMeetingId !== meetingId)
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

    console.log(
      `[pipeline] extractAll: ${whisper.segments.length} segments, ${existingTasks.length} existing tasks`,
    )
    const result = await extractAllFromTranscript({
      today: todayIso(),
      participants: project.participants.map((p) => ({
        id: p.id,
        name: p.name,
      })),
      existingTasks,
      whisperSegments: whisper.segments,
    })
    console.log(
      `[pipeline] extractAll ok: speakers=${result.detectedSpeakers.join(', ')}, tasks=${result.tasks.length}, updates=${result.updates.length}`,
    )

    // Dedupe: drop new tasks that match an existingTask by owner+description.
    // Synthesize an update if the LLM didn't already cover that taskId.
    const dedupedTasks = []
    const synthUpdates = [...result.updates]
    const knownUpdateIds = new Set(result.updates.map((u) => u.taskId))
    let droppedCount = 0
    for (const t of result.tasks) {
      const dup = findDuplicateExisting(
        t.ownerName,
        t.description,
        existingTasks,
      )
      if (!dup) {
        dedupedTasks.push(t)
        continue
      }
      droppedCount++
      if (knownUpdateIds.has(dup.id)) continue
      const statusChanged: Record<string, unknown> = { taskId: dup.id }
      // We don't know the new status from the draft task shape; leave null and
      // let the user see it as a no-op update entry that flags the merge.
      statusChanged.status = null
      if (t.deadline && t.deadline !== dup.deadline) {
        statusChanged.deadline = t.deadline
      }
      synthUpdates.push(
        statusChanged as (typeof result.updates)[number],
      )
      knownUpdateIds.add(dup.id)
    }
    if (droppedCount > 0) {
      console.log(
        `[dedupe] dropped ${droppedCount} duplicate task${droppedCount === 1 ? '' : 's'}, total updates=${synthUpdates.length}`,
      )
    }
    result.tasks = dedupedTasks
    result.updates = synthUpdates

    const transcript: Transcript = {
      meetingId,
      language: whisper.language,
      fullText: whisper.fullText,
      segments: result.segments,
    }
    await writeTranscript(transcript)

    await updateMeeting(meetingId, {
      status: 'awaiting_speaker_confirmation',
      transcribedAt: new Date().toISOString(),
      detectedSpeakers: result.detectedSpeakers,
      suggestedNames: result.suggestedNames,
      momDraft: result.mom,
      tasksDraft: result.tasks,
      updatesDraft: result.updates,
      transcriptionError: null,
    })
    console.log(`[pipeline] ${meetingId} ready for speaker confirmation`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[pipeline] failed for ${meetingId}:`, message)
    await updateMeeting(meetingId, {
      status: 'transcription_failed',
      transcriptionError: message,
    })
  }
}
