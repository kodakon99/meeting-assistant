import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import type {
  Meeting,
  Participant,
  Project,
  Transcript,
  TranscriptSegment,
} from '../lib/types'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Avatar } from '../components/ui/Avatar'

type SelectionValue = string | 'UNKNOWN' | ''

function truncate(text: string, max = 180): string {
  const t = text.trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

function topUtterances(
  segments: TranscriptSegment[],
  speaker: string,
  n: number,
): TranscriptSegment[] {
  return segments
    .filter((s) => s.speaker === speaker)
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, n)
}

function computeDisplayNames(
  detectedSpeakers: string[],
  selections: Record<string, SelectionValue>,
  participants: Participant[],
): Record<string, string> {
  const byId = new Map(participants.map((p) => [p.id, p]))
  const nameTotals = new Map<string, number>()
  for (const sp of detectedSpeakers) {
    const v = selections[sp]
    if (v && v !== 'UNKNOWN') {
      const name = byId.get(v)?.name
      if (name) nameTotals.set(name, (nameTotals.get(name) ?? 0) + 1)
    }
  }

  const nameCounts = new Map<string, number>()
  let unknownIdx = 0
  const result: Record<string, string> = {}
  for (const sp of detectedSpeakers) {
    const v = selections[sp]
    if (v && v !== 'UNKNOWN') {
      const name = byId.get(v)?.name ?? 'Unknown'
      const total = nameTotals.get(name) ?? 1
      const count = (nameCounts.get(name) ?? 0) + 1
      nameCounts.set(name, count)
      result[sp] = total > 1 ? `${name} #${count}` : name
    } else if (v === 'UNKNOWN') {
      const letter = String.fromCharCode('A'.charCodeAt(0) + unknownIdx++)
      result[sp] = `Person ${letter}`
    } else {
      result[sp] = '—'
    }
  }
  return result
}

const SELECT_CLASS =
  'min-w-[12rem] rounded-card border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink transition focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft'

export function SpeakerConfirmation() {
  const { id: projectId, meetingId } = useParams<{
    id: string
    meetingId: string
  }>()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [selections, setSelections] = useState<Record<string, SelectionValue>>(
    {},
  )
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId || !meetingId) return
    let cancelled = false
    Promise.all([
      api.getProject(projectId),
      api.getMeeting(meetingId),
      api.getTranscript(meetingId),
    ])
      .then(([p, m, t]) => {
        if (cancelled) return
        setProject(p)
        setMeeting(m)
        setTranscript(t)

        const init: Record<string, SelectionValue> = {}
        const byName = new Map(
          p.participants.map(
            (x) => [x.name.trim().toLowerCase(), x] as const,
          ),
        )
        for (const sp of m.detectedSpeakers ?? []) {
          const existing = m.speakerMap?.[sp]
          if (existing?.participantId) {
            init[sp] = existing.participantId
            continue
          }
          if (existing && existing.participantId === null) {
            init[sp] = 'UNKNOWN'
            continue
          }
          const suggested = m.suggestedNames?.[sp]
          if (suggested) {
            const match = byName.get(suggested.trim().toLowerCase())
            init[sp] = match ? match.id : ''
          } else {
            init[sp] = ''
          }
        }
        setSelections(init)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [projectId, meetingId])

  const displayNames = useMemo(() => {
    if (!meeting?.detectedSpeakers || !project) return {}
    return computeDisplayNames(
      meeting.detectedSpeakers,
      selections,
      project.participants,
    )
  }, [meeting?.detectedSpeakers, selections, project])

  const allSelected =
    meeting?.detectedSpeakers?.every((sp) => selections[sp]) ?? false

  async function onSubmit() {
    if (!meeting || !projectId) return
    setSubmitting(true)
    setError(null)
    try {
      const assignments: Record<string, { participantId: string | null }> = {}
      for (const sp of meeting.detectedSpeakers ?? []) {
        const v = selections[sp]
        assignments[sp] = {
          participantId: v && v !== 'UNKNOWN' ? v : null,
        }
      }
      await api.saveSpeakerMap(meeting.id, assignments)
      navigate(`/projects/${projectId}`)
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  if (loading) return <p className="text-ink-3">Loading…</p>
  if (error && !meeting) {
    return (
      <p className="rounded-card bg-[oklch(0.95_0.05_18)] p-3 text-[13px] text-rose-status">
        {error}
      </p>
    )
  }
  if (!meeting || !transcript || !project) return null

  const speakers = meeting.detectedSpeakers ?? []

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="m-0 text-[26px] font-semibold tracking-tight text-ink">
          Who&rsquo;s who?
        </h1>
        <p className="mt-1 m-0 text-[13px] text-ink-3">
          {transcript.language ?? 'unknown language'} ·{' '}
          {transcript.segments.length} segments · {speakers.length} speaker
          {speakers.length === 1 ? '' : 's'} detected
        </p>
      </div>

      <div className="flex flex-col gap-3.5">
        {speakers.map((sp, i) => {
          const utterances = topUtterances(transcript.segments, sp, 2)
          const selected = selections[sp] ?? ''
          const dn = displayNames[sp]
          return (
            <Card
              key={sp}
              className="p-5 animate-ma-fade-up"
              {...({ style: { animationDelay: `${i * 60}ms` } } as object)}
            >
              <div className="mb-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Avatar
                    person={{ id: sp, name: dn && dn !== '—' ? dn : sp }}
                    size={36}
                  />
                  <div>
                    <p className="m-0 text-[12px] font-semibold text-ink-3 uppercase tracking-[0.05em]">
                      {sp}
                    </p>
                    <p className="m-0 mt-0.5 text-[18px] font-semibold text-ink">
                      {dn}
                    </p>
                  </div>
                </div>
                <select
                  value={selected}
                  onChange={(e) =>
                    setSelections((prev) => ({
                      ...prev,
                      [sp]: e.target.value as SelectionValue,
                    }))
                  }
                  className={SELECT_CLASS}
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {project.participants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value="UNKNOWN">Unknown</option>
                </select>
              </div>
              <ul className="flex flex-col gap-2 m-0 p-0 list-none border-t border-line pt-3 text-[13px] text-ink-2">
                {utterances.length === 0 ? (
                  <li className="italic text-ink-3">No utterances</li>
                ) : (
                  utterances.map((u, i) => (
                    <li key={i} className="leading-snug">
                      &ldquo;{truncate(u.text)}&rdquo;
                    </li>
                  ))
                )}
              </ul>
            </Card>
          )
        })}
      </div>

      {error && (
        <p className="rounded-card bg-[oklch(0.95_0.05_18)] p-3 text-[13px] text-rose-status">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => navigate(`/projects/${projectId}`)}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button onClick={onSubmit} disabled={!allSelected || submitting}>
          {submitting ? 'Saving…' : 'Confirm speakers'}
        </Button>
      </div>
    </div>
  )
}
