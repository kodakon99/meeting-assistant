import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Button } from '../components/Button'
import { Card } from '../components/Card'

const INPUT_CLASS =
  'w-full rounded-card border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-3 transition focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft'

export function NewProject() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [participants, setParticipants] = useState<string[]>(['', '', ''])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateParticipant(i: number, value: string) {
    setParticipants((prev) => prev.map((p, idx) => (idx === i ? value : p)))
  }

  function addParticipant() {
    setParticipants((prev) => [...prev, ''])
  }

  function removeParticipant(i: number) {
    setParticipants((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const project = await api.createProject(name, participants)
      navigate(`/projects/${project.id}`)
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="m-0 text-[26px] font-semibold tracking-tight text-ink">
          New project
        </h1>
        <p className="mt-1 m-0 text-[13px] text-ink-3">
          Give it a name and seed it with the people who'll show up to meetings.
        </p>
      </div>
      <Card className="p-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div>
            <label className="block text-[13px] font-semibold text-ink-2">
              Project name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Q2 product launch"
              className={`mt-1.5 ${INPUT_CLASS}`}
            />
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-ink-2">
              Participants
            </label>
            <p className="mt-1 text-[12px] text-ink-3">
              Names only — you&rsquo;ll add emails after the first meeting.
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {participants.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={p}
                    onChange={(e) => updateParticipant(i, e.target.value)}
                    placeholder={`Participant ${i + 1}`}
                    className={`flex-1 ${INPUT_CLASS}`}
                  />
                  {participants.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => removeParticipant(i)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={addParticipant}
              className="mt-2"
            >
              + Add participant
            </Button>
          </div>

          {error && (
            <p className="rounded-card bg-[oklch(0.95_0.05_18)] p-3 text-[13px] text-rose-status">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/')}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? 'Creating…' : 'Create project'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
