import { Client } from '@notionhq/client'
import type {
  DispatchIntegrationResult,
  Meeting,
  NotionRowPreview,
  Project,
  Task,
  TaskStatus,
} from '../types.js'
import { readTasks, writeTasks } from '../storage.js'

type NotionProperties = Parameters<Client['pages']['create']>[0]['properties']

function extractDatabaseId(raw: string): string | null {
  const trimmed = raw.trim()
  // Accepts: full Notion URL, dashed UUID, plain 32-hex
  const match = trimmed.match(/[0-9a-f]{32}/i)
  return match ? match[0] : null
}

function isConfigured(): { token: string; databaseId: string } | null {
  const token = process.env.NOTION_API_KEY
  const raw = process.env.NOTION_DATABASE_ID
  if (!token || !raw) return null
  const databaseId = extractDatabaseId(raw)
  if (!databaseId) return null
  return { token, databaseId }
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  done: 'Done',
}

function pickNotionTasks(meeting: Meeting, allProjectTasks: Task[]): Task[] {
  const updatedIds = new Set(
    (meeting.taskUpdates ?? []).map((u) => u.taskId),
  )
  const seen = new Set<string>()
  const out: Task[] = []
  for (const t of allProjectTasks) {
    if (seen.has(t.id)) continue
    if (t.sourceMeetingId === meeting.id || updatedIds.has(t.id)) {
      out.push(t)
      seen.add(t.id)
    }
  }
  return out
}

export function buildNotionPreviews(
  meeting: Meeting,
  allProjectTasks: Task[],
): NotionRowPreview[] {
  return pickNotionTasks(meeting, allProjectTasks).map((t) => ({
    taskId: t.id,
    description: t.description,
    ownerName: t.ownerDisplayName,
    deadline: t.deadline,
    status: t.status,
  }))
}

export async function dispatchToNotion(
  meeting: Meeting,
  project: Project,
  allProjectTasks: Task[],
): Promise<DispatchIntegrationResult> {
  const cfg = isConfigured()
  if (!cfg) {
    return {
      outcome: 'not_configured',
      detail:
        'Set NOTION_API_KEY and NOTION_DATABASE_ID in .env to enable Notion sync.',
    }
  }

  const tasksThisMeeting = pickNotionTasks(meeting, allProjectTasks)
  if (tasksThisMeeting.length === 0) {
    return {
      outcome: 'ok',
      detail: 'no created or updated tasks to sync',
      link: `https://www.notion.so/${cfg.databaseId.replace(/-/g, '')}`,
    }
  }

  const client = new Client({ auth: cfg.token })
  const meetingDate = meeting.createdAt.slice(0, 10)
  const sourceLabel = `${project.name} · ${meetingDate}`

  let created = 0
  let updated = 0
  const errors: string[] = []
  const newPageIds = new Map<string, string>()

  for (const t of tasksThisMeeting) {
    const properties = buildProperties(t, sourceLabel)
    try {
      const result = await upsertOne(client, cfg.databaseId, t, properties)
      if (result.reused) {
        updated++
      } else {
        created++
        newPageIds.set(t.id, result.pageId)
      }
      // If a page was found-via-fallback, capture the new id too
      if (result.idChanged) {
        newPageIds.set(t.id, result.pageId)
      }
    } catch (err) {
      errors.push(
        `"${t.description}": ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  // Persist any new / changed page ids back to tasks.json
  if (newPageIds.size > 0) {
    const allTasks = await readTasks()
    let dirty = false
    const next = allTasks.map((task) => {
      const newId = newPageIds.get(task.id)
      if (newId && task.notionPageId !== newId) {
        dirty = true
        return { ...task, notionPageId: newId }
      }
      return task
    })
    if (dirty) await writeTasks(next)
  }

  if (created === 0 && updated === 0 && errors.length > 0) {
    return {
      outcome: 'error',
      detail: errors.join('; '),
    }
  }

  const detailParts: string[] = []
  if (created > 0) detailParts.push(`created ${created} row${created === 1 ? '' : 's'}`)
  if (updated > 0) detailParts.push(`updated ${updated} row${updated === 1 ? '' : 's'}`)
  if (errors.length > 0) {
    detailParts.push(`${errors.length} failed: ${errors.join('; ')}`)
  }

  return {
    outcome: errors.length > 0 ? 'error' : 'ok',
    detail: detailParts.join(' · '),
    link: `https://www.notion.so/${cfg.databaseId.replace(/-/g, '')}`,
  }
}

function buildProperties(task: Task, sourceLabel: string): NotionProperties {
  return {
    Name: {
      title: [{ text: { content: task.description || '(untitled)' } }],
    },
    Owner: {
      rich_text: [{ text: { content: task.ownerDisplayName } }],
    },
    Deadline: task.deadline
      ? { date: { start: task.deadline } }
      : { date: null },
    Status: {
      select: { name: STATUS_LABEL[task.status] },
    },
    'Source meeting': {
      rich_text: [{ text: { content: sourceLabel } }],
    },
  }
}

async function upsertOne(
  client: Client,
  databaseId: string,
  task: Task,
  properties: NotionProperties,
): Promise<{ pageId: string; reused: boolean; idChanged: boolean }> {
  if (task.notionPageId) {
    try {
      const updated = await client.pages.update({
        page_id: task.notionPageId,
        properties,
      })
      return { pageId: updated.id, reused: true, idChanged: false }
    } catch (err) {
      if (!isMissingOrArchived(err)) throw err
      // Page is gone (deleted) or archived (soft-deleted via Notion UI) —
      // fall through to create a fresh row.
    }
  }
  const created = await client.pages.create({
    parent: { database_id: databaseId },
    properties,
  })
  return {
    pageId: created.id,
    reused: false,
    idChanged: Boolean(task.notionPageId),
  }
}

function isMissingOrArchived(err: unknown): boolean {
  const e = err as { code?: string; message?: string }
  if (e.code === 'object_not_found') return true
  if (
    e.code === 'validation_error' &&
    typeof e.message === 'string' &&
    /archived/i.test(e.message)
  ) {
    return true
  }
  return false
}
