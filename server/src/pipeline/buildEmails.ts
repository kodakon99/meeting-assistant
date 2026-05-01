import type { Meeting, MockedEmail, Project, Task } from '../types.js'
import {
  enrichTasks,
  formatBuffer,
  formatIsoDate,
  todayIso,
  type EnrichedTask,
} from '../lib/taskGraph.js'

const APP_URL = process.env.APP_URL ?? 'http://localhost:5173'

function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name
}

function meetingDateLabel(meeting: Meeting): string {
  return formatIsoDate(meeting.createdAt.slice(0, 10))
}

function bulletForTask(t: EnrichedTask): string[] {
  const lines: string[] = []
  const deadline = t.deadline ? `due ${formatIsoDate(t.deadline)}` : 'no deadline'
  const buffer =
    t.buffer !== null
      ? ` · buffer ${formatBuffer(t.buffer)}`
      : ''
  lines.push(`• ${t.description} — ${deadline}${buffer}`)
  const blockers = t.blockedBy.filter((b) => !b.done)
  if (blockers.length > 0) {
    const list = blockers
      .map(
        (b) =>
          `"${b.description}" (${b.ownerDisplayName}${b.deadline ? `, due ${formatIsoDate(b.deadline)}` : ''})`,
      )
      .join(', ')
    lines.push(`    ↳ Blocked by: ${list}`)
    lines.push(
      `    ↳ Earliest start: ${formatIsoDate(t.earliestStart)}`,
    )
  }
  if (t.buffer !== null && t.buffer < 0) {
    lines.push(`    ⚠ Heads up: ${formatBuffer(t.buffer)}`)
  } else if (t.buffer !== null && t.buffer <= 1) {
    lines.push(`    ⚠ Heads up: tight timeline (${formatBuffer(t.buffer)} buffer)`)
  }
  if (t.notes) {
    lines.push(`    notes: ${t.notes}`)
  }
  return lines
}

function buildPersonalEmail(
  participantId: string,
  participantName: string,
  participantEmail: string | null,
  myTasks: EnrichedTask[],
  meeting: Meeting,
  project: Project,
  affectedByThisMeetingSlip: { task: EnrichedTask; cause: string }[],
): MockedEmail {
  const open = myTasks.filter((t) => t.status !== 'done')
  const lines: string[] = []
  lines.push(`Hi ${firstName(participantName)},`)
  lines.push('')
  lines.push(
    `Here's the recap from the ${project.name} meeting on ${meetingDateLabel(meeting)}.`,
  )
  lines.push('')

  if (affectedByThisMeetingSlip.length > 0) {
    lines.push('Heads up — changes that affect you:')
    for (const a of affectedByThisMeetingSlip) {
      lines.push(`  • ${a.cause}`)
    }
    lines.push('')
  }

  if (open.length === 0) {
    lines.push('You have no open tasks right now. Nice.')
  } else {
    lines.push(`Your open tasks (${open.length}):`)
    for (const t of open) {
      for (const line of bulletForTask(t)) lines.push(line)
    }
  }
  lines.push('')
  lines.push(
    `Full timeline: ${APP_URL}/projects/${project.id}/me/${participantId}`,
  )

  return {
    to: [{ participantId, name: participantName, email: participantEmail }],
    subject: `Your tasks from ${project.name} — ${meetingDateLabel(meeting)}`,
    body: lines.join('\n'),
  }
}

function buildMomEmail(meeting: Meeting, project: Project): MockedEmail {
  const lines: string[] = []
  lines.push(`Hi everyone,`)
  lines.push('')
  lines.push(
    `Below are the minutes from the ${project.name} meeting on ${meetingDateLabel(meeting)}.`,
  )
  lines.push('')
  lines.push('— Minutes of meeting —')
  lines.push(meeting.mom?.trim() || '(no summary recorded)')
  lines.push('')

  if (meeting.taskUpdates && meeting.taskUpdates.length > 0) {
    lines.push('— What changed —')
    for (const u of meeting.taskUpdates) {
      const parts: string[] = [`"${u.description}"`]
      if (u.before.status !== u.after.status) {
        parts.push(`status ${u.before.status} → ${u.after.status}`)
      }
      if (u.before.deadline !== u.after.deadline) {
        parts.push(
          `deadline ${formatIsoDate(u.before.deadline)} → ${formatIsoDate(u.after.deadline)}`,
        )
      }
      lines.push(`  • ${parts.join(' · ')}`)
    }
    lines.push('')
  }

  lines.push(`Project page: ${APP_URL}/projects/${project.id}`)
  return {
    to: project.participants.map((p) => ({
      participantId: p.id,
      name: p.name,
      email: p.email,
    })),
    subject: `Minutes: ${project.name} — ${meetingDateLabel(meeting)}`,
    body: lines.join('\n'),
  }
}

export function buildEmails(
  meeting: Meeting,
  project: Project,
  allProjectTasks: Task[],
): MockedEmail[] {
  const enriched = enrichTasks(allProjectTasks, todayIso())

  // Slips caused by this meeting's taskUpdates
  const slips = (meeting.taskUpdates ?? []).filter((u) => {
    if (u.before.deadline === u.after.deadline) return false
    if (u.before.deadline === null || u.after.deadline === null) return false
    return u.after.deadline > u.before.deadline
  })

  const tasksById = new Map(enriched.map((t) => [t.id, t]))

  // For each participant, find which of THEIR tasks are downstream of a slipped task
  const affectedByParticipant = new Map<
    string,
    { task: EnrichedTask; cause: string }[]
  >()
  for (const t of enriched) {
    if (!t.ownerParticipantId) continue
    if (t.status === 'done') continue
    for (const upId of t.dependsOn) {
      const matchedSlip = slips.find((s) => s.taskId === upId)
      if (!matchedSlip) continue
      const upstream = tasksById.get(upId)
      const cause = `"${t.description}" is now blocked longer — "${matchedSlip.description}"${upstream?.ownerDisplayName ? ` (${upstream.ownerDisplayName})` : ''} slipped from ${formatIsoDate(matchedSlip.before.deadline)} to ${formatIsoDate(matchedSlip.after.deadline)}. Your earliest start: ${formatIsoDate(t.earliestStart)}.`
      const arr = affectedByParticipant.get(t.ownerParticipantId) ?? []
      arr.push({ task: t, cause })
      affectedByParticipant.set(t.ownerParticipantId, arr)
    }
  }

  const emails: MockedEmail[] = []

  // 1. MoM-to-everyone — single email addressed to all participants
  emails.push(buildMomEmail(meeting, project))

  // 2. Per-participant task email — only for those who own ≥ 1 task
  for (const p of project.participants) {
    const myTasks = enriched.filter((t) => t.ownerParticipantId === p.id)
    if (myTasks.length === 0) continue
    emails.push(
      buildPersonalEmail(
        p.id,
        p.name,
        p.email,
        myTasks,
        meeting,
        project,
        affectedByParticipant.get(p.id) ?? [],
      ),
    )
  }

  return emails
}
