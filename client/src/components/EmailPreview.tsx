import type { MockedEmail } from '../lib/types'
import { Card } from './Card'

export function EmailPreview({ email }: { email: MockedEmail }) {
  const recipients = email.to
    .map((t) =>
      t.email ? `${t.name} <${t.email}>` : `${t.name} (no email set)`,
    )
    .join(', ')
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line bg-surface-2 px-4 py-2 text-[12px]">
        <p className="m-0">
          <span className="font-semibold uppercase tracking-wide text-ink-3">
            To:
          </span>{' '}
          <span className="break-words text-ink">{recipients}</span>
        </p>
        <p className="m-0 mt-0.5">
          <span className="font-semibold uppercase tracking-wide text-ink-3">
            Subject:
          </span>{' '}
          <span className="font-semibold text-ink">{email.subject}</span>
        </p>
      </div>
      <pre className="m-0 whitespace-pre-wrap break-words p-4 font-mono text-[12px] leading-relaxed text-ink-2">
        {email.body}
      </pre>
    </Card>
  )
}
