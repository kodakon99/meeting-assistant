import { WebClient } from '@slack/web-api'
import type {
  DispatchIntegrationResult,
  Meeting,
  Participant,
  Project,
  SlackMessagePreview,
  Task,
} from '../types.js'
import { enrichTasks, formatIsoDate, todayIso } from '../lib/taskGraph.js'

function isConfigured(): { token: string; channel: string } | null {
  const token = process.env.SLACK_BOT_TOKEN
  const channel = process.env.SLACK_CHANNEL_ID
  if (!token || !channel) return null
  return { token, channel }
}

function buildPersonalText(
  participant: Participant,
  myOpenTasks: ReturnType<typeof enrichTasks>,
  project: Project,
  mention: string,
): string {
  const lines: string[] = []
  lines.push(
    `Hey ${mention} — task summary from *${project.name}*:`,
  )
  if (myOpenTasks.length === 0) {
    lines.push('• No open tasks.')
    return lines.join('\n')
  }
  for (const t of myOpenTasks) {
    const deadline = t.deadline ? `due ${formatIsoDate(t.deadline)}` : 'no deadline'
    lines.push(`• ${t.description} — ${deadline}`)
    const blockers = t.blockedBy.filter((b) => !b.done)
    if (blockers.length > 0) {
      const list = blockers
        .map((b) => `"${b.description}" (${b.ownerDisplayName})`)
        .join(', ')
      lines.push(`    blocked by: ${list}`)
    }
    if (t.notes && t.notes.length < 200) {
      lines.push(`    _${t.notes}_`)
    }
  }
  return lines.join('\n')
}

export function buildSlackPreviews(
  project: Project,
  allProjectTasks: Task[],
): SlackMessagePreview[] {
  const enriched = enrichTasks(allProjectTasks, todayIso())
  const cfg = isConfigured()
  const channel = cfg?.channel ?? null

  const out: SlackMessagePreview[] = []
  for (const p of project.participants) {
    const open = enriched.filter(
      (t) => t.ownerParticipantId === p.id && t.status !== 'done',
    )
    if (open.length === 0) continue
    const mention = `*${p.name}*`
    out.push({
      participantId: p.id,
      participantName: p.name,
      email: p.email,
      text: buildPersonalText(p, open, project, mention),
      channelId: channel,
    })
  }
  return out
}

export async function dispatchToSlack(
  _meeting: Meeting,
  project: Project,
  allProjectTasks: Task[],
): Promise<DispatchIntegrationResult> {
  const cfg = isConfigured()
  if (!cfg) {
    return {
      outcome: 'not_configured',
      detail:
        'Set SLACK_BOT_TOKEN and SLACK_CHANNEL_ID in .env to enable Slack posts.',
    }
  }

  const enriched = enrichTasks(allProjectTasks, todayIso())
  const client = new WebClient(cfg.token)

  let posted = 0
  let mentionsResolved = 0
  let firstPermalink: string | null = null
  const errors: string[] = []

  for (const p of project.participants) {
    const open = enriched.filter(
      (t) => t.ownerParticipantId === p.id && t.status !== 'done',
    )
    if (open.length === 0) continue

    let mention = `*${p.name}*`
    if (p.email) {
      try {
        const lookup = await client.users.lookupByEmail({ email: p.email })
        const userId = lookup.user?.id
        if (userId) {
          mention = `<@${userId}>`
          mentionsResolved++
        }
      } catch {
        // users_not_found — keep plain-text mention, no error reported
      }
    }

    const text = buildPersonalText(p, open, project, mention)
    try {
      const resp = await client.chat.postMessage({
        channel: cfg.channel,
        text,
      })
      posted++
      if (!firstPermalink && resp.ts) {
        try {
          const link = await client.chat.getPermalink({
            channel: cfg.channel,
            message_ts: resp.ts,
          })
          firstPermalink = link.permalink ?? null
        } catch {
          // ignore permalink failure
        }
      }
    } catch (err) {
      errors.push(
        `${p.name}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  if (posted === 0 && errors.length > 0) {
    return {
      outcome: 'error',
      detail: errors.join('; '),
    }
  }

  const detailParts = [`posted ${posted} message${posted === 1 ? '' : 's'}`]
  if (mentionsResolved > 0) {
    detailParts.push(`${mentionsResolved} mention${mentionsResolved === 1 ? '' : 's'} resolved`)
  }
  if (errors.length > 0) {
    detailParts.push(`${errors.length} failed: ${errors.join('; ')}`)
  }

  return {
    outcome: errors.length > 0 ? 'error' : 'ok',
    detail: detailParts.join(' · '),
    link: firstPermalink,
  }
}
