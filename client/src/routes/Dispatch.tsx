import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import type {
  DispatchPreview,
  DispatchResult,
  Meeting,
  MockedEmail,
} from '../lib/types'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { EmailPreview } from '../components/EmailPreview'
import { Celebration } from '../components/animated/Celebration'

type Tab = 'email' | 'slack' | 'notion'

export function Dispatch() {
  const { id: projectId, meetingId } = useParams<{
    id: string
    meetingId: string
  }>()
  const navigate = useNavigate()

  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [preview, setPreview] = useState<DispatchPreview | null>(null)
  const [emailsAfterDispatch, setEmailsAfterDispatch] = useState<
    MockedEmail[] | null
  >(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('email')
  const [showCelebration, setShowCelebration] = useState(false)

  useEffect(() => {
    if (!meetingId) return
    let cancelled = false
    Promise.all([api.getMeeting(meetingId), api.getDispatchPreview(meetingId)])
      .then(([m, p]) => {
        if (cancelled) return
        setMeeting(m)
        setPreview(p)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [meetingId])

  async function onDispatch() {
    if (!meeting) return
    setSubmitting(true)
    setError(null)
    try {
      const { meeting: updated, emails } = await api.dispatchMeeting(meeting.id)
      setMeeting(updated)
      setEmailsAfterDispatch(emails)
      setShowCelebration(true)
      window.setTimeout(() => setShowCelebration(false), 1500)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function onReDispatch() {
    if (!meeting) return
    if (
      !window.confirm(
        'Re-dispatch this meeting? Slack messages will post again and Notion rows will duplicate.',
      )
    ) {
      return
    }
    onDispatch()
  }

  if (loading) return <p className="text-ink-3">Loading…</p>
  if (error && !meeting) {
    return (
      <p className="rounded-md bg-[oklch(0.95_0.05_18)] p-3 text-sm text-rose-status">{error}</p>
    )
  }
  if (!meeting || !preview) return null

  const isDispatched = meeting.status === 'dispatched'
  const dispatchedEmails = emailsAfterDispatch ?? preview.emails

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link
            to={`/projects/${projectId}`}
            className="text-sm text-ink-3 hover:text-ink-2"
          >
            ← Back to project
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-ink">
            {isDispatched ? 'Dispatch results' : 'Dispatch preview'}
          </h1>
          <p className="mt-1 text-sm text-ink-3">
            {new Date(meeting.createdAt).toLocaleString()}
          </p>
          {isDispatched && meeting.dispatch && (
            <p className="mt-1 text-xs text-ink-3">
              Dispatched on {new Date(meeting.dispatch.dispatchedAt).toLocaleString()}
            </p>
          )}
        </div>
        {!isDispatched && (
          <Button onClick={onDispatch} disabled={submitting}>
            {submitting ? 'Dispatching…' : 'Approve & dispatch'}
          </Button>
        )}
        {isDispatched && (
          <div className="flex items-center gap-2">
            <Celebration visible={showCelebration} size={28} />
            <span className="rounded-pill bg-[oklch(0.95_0.05_152)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-status">
              Dispatched
            </span>
            <Button
              variant="secondary"
              onClick={onReDispatch}
              disabled={submitting}
            >
              {submitting ? 'Re-dispatching…' : 'Re-dispatch'}
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-[oklch(0.95_0.05_18)] p-3 text-sm text-rose-status">
          {error}
        </p>
      )}

      <div className="mb-4 flex gap-1 border-b border-line">
        <TabBtn
          active={tab === 'email'}
          onClick={() => setTab('email')}
          label={`Email (${preview.emails.length})`}
          configured={true}
          result={meeting.dispatch?.email}
          isDispatched={isDispatched}
        />
        <TabBtn
          active={tab === 'slack'}
          onClick={() => setTab('slack')}
          label={`Slack (${preview.slackMessages.length})`}
          configured={preview.integrationsConfigured.slack}
          result={meeting.dispatch?.slack}
          isDispatched={isDispatched}
        />
        <TabBtn
          active={tab === 'notion'}
          onClick={() => setTab('notion')}
          label={`Notion (${preview.notionRows.length})`}
          configured={preview.integrationsConfigured.notion}
          result={meeting.dispatch?.notion}
          isDispatched={isDispatched}
        />
      </div>

      {tab === 'email' && (
        <div className="space-y-4">
          <ResultBanner result={isDispatched ? meeting.dispatch?.email : undefined} />
          {dispatchedEmails.length === 0 ? (
            <Card className="p-6 text-center text-ink-3">
              No emails to send.
            </Card>
          ) : (
            dispatchedEmails.map((e, i) => <EmailPreview key={i} email={e} />)
          )}
        </div>
      )}

      {tab === 'slack' && (
        <div className="space-y-4">
          <ResultBanner result={isDispatched ? meeting.dispatch?.slack : undefined} />
          {!preview.integrationsConfigured.slack && (
            <Card className="p-4 text-sm text-ink-2">
              <p className="font-medium text-ink">Slack not configured.</p>
              <p className="mt-1 text-ink-2">
                Set <code className="rounded bg-surface-2 px-1">SLACK_BOT_TOKEN</code>{' '}
                and{' '}
                <code className="rounded bg-surface-2 px-1">SLACK_CHANNEL_ID</code>{' '}
                in your <code className="rounded bg-surface-2 px-1">.env</code> to
                enable. Skipped on dispatch.
              </p>
            </Card>
          )}
          {preview.slackMessages.length === 0 ? (
            <Card className="p-6 text-center text-ink-3">
              No participants with open tasks.
            </Card>
          ) : (
            preview.slackMessages.map((msg) => (
              <Card key={msg.participantId} className="overflow-hidden">
                <div className="border-b border-line bg-surface-2 px-4 py-2 text-xs">
                  <p>
                    <span className="font-semibold uppercase tracking-wide text-ink-3">
                      To:
                    </span>{' '}
                    <span className="text-ink">
                      #{msg.channelId ?? '(channel-id-missing)'} · @
                      {msg.participantName}
                    </span>
                  </p>
                </div>
                <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-ink-2">
                  {msg.text}
                </pre>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'notion' && (
        <div className="space-y-4">
          <ResultBanner result={isDispatched ? meeting.dispatch?.notion : undefined} />
          {!preview.integrationsConfigured.notion && (
            <Card className="p-4 text-sm text-ink-2">
              <p className="font-medium text-ink">Notion not configured.</p>
              <p className="mt-1 text-ink-2">
                Set <code className="rounded bg-surface-2 px-1">NOTION_API_KEY</code>{' '}
                and{' '}
                <code className="rounded bg-surface-2 px-1">NOTION_DATABASE_ID</code>{' '}
                in your <code className="rounded bg-surface-2 px-1">.env</code> to
                enable. Database needs columns:{' '}
                <code className="rounded bg-surface-2 px-1">Name</code>,{' '}
                <code className="rounded bg-surface-2 px-1">Owner</code>,{' '}
                <code className="rounded bg-surface-2 px-1">Deadline</code>,{' '}
                <code className="rounded bg-surface-2 px-1">Status</code>,{' '}
                <code className="rounded bg-surface-2 px-1">Source meeting</code>.
              </p>
            </Card>
          )}
          {preview.notionRows.length === 0 ? (
            <Card className="p-6 text-center text-ink-3">
              No new tasks from this meeting to sync.
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Owner</th>
                    <th className="px-3 py-2">Deadline</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {preview.notionRows.map((r) => (
                    <tr key={r.taskId}>
                      <td className="px-3 py-2 text-ink">
                        {r.description || '(untitled)'}
                      </td>
                      <td className="px-3 py-2 text-ink-2">
                        {r.ownerName}
                      </td>
                      <td className="px-3 py-2 text-ink-2">
                        {r.deadline ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-ink-2">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {!isDispatched && (
        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => navigate(`/projects/${projectId}`)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={onDispatch} disabled={submitting}>
            {submitting ? 'Dispatching…' : 'Approve & dispatch'}
          </Button>
        </div>
      )}
    </div>
  )
}

function ResultBanner({
  result,
}: {
  result: import('../lib/types').DispatchIntegrationResult | undefined
}) {
  if (!result) return null
  const tone =
    result.outcome === 'ok'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : result.outcome === 'not_configured'
        ? 'border-line bg-surface-2 text-ink-2'
        : 'border-rose-200 bg-[oklch(0.95_0.05_18)] text-rose-status'
  const label =
    result.outcome === 'ok'
      ? 'Result'
      : result.outcome === 'not_configured'
        ? 'Skipped'
        : 'Error'
  if (!result.detail && result.outcome === 'ok') return null
  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${tone}`}>
      <span className="font-semibold">{label}: </span>
      <span className="break-words">{result.detail ?? '(no detail)'}</span>
      {result.link && (
        <>
          {' '}
          ·{' '}
          <a
            href={result.link}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            view
          </a>
        </>
      )}
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  label,
  configured,
  result,
  isDispatched,
}: {
  active: boolean
  onClick: () => void
  label: string
  configured: boolean
  result?: DispatchResult['slack']
  isDispatched: boolean
}) {
  let badge: { text: string; tone: string } | null = null
  if (isDispatched && result) {
    if (result.outcome === 'ok') badge = { text: 'Sent', tone: 'bg-emerald-100 text-emerald-700' }
    else if (result.outcome === 'not_configured')
      badge = { text: 'Skipped', tone: 'bg-surface-2 text-ink-3' }
    else badge = { text: 'Error', tone: 'bg-rose-100 text-rose-status' }
  } else if (!isDispatched) {
    badge = configured
      ? { text: 'Configured', tone: 'bg-emerald-100 text-emerald-700' }
      : { text: 'Not configured', tone: 'bg-surface-2 text-ink-3' }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-b-2 border-accent text-accent-ink'
          : 'border-b-2 border-transparent text-ink-3 hover:text-ink'
      }`}
    >
      {label}
      {badge && (
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${badge.tone}`}
        >
          {badge.text}
        </span>
      )}
    </button>
  )
}
