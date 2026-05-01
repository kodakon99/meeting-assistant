import nodemailer from 'nodemailer'
import type { DispatchIntegrationResult, MockedEmail } from '../types.js'

function isConfigured(): { user: string; pass: string; fromName: string } | null {
  const user = process.env.GMAIL_USER?.trim()
  const passRaw = process.env.GMAIL_APP_PASSWORD
  const pass = passRaw ? passRaw.replace(/\s+/g, '') : ''
  if (!user || !pass) return null
  const fromName =
    (process.env.EMAIL_FROM_NAME ?? 'Meeting Assistant').trim() ||
    'Meeting Assistant'
  return { user, pass, fromName }
}

export async function dispatchEmails(
  emails: MockedEmail[],
): Promise<DispatchIntegrationResult> {
  const cfg = isConfigured()
  if (!cfg) {
    return {
      outcome: 'ok',
      detail: `${emails.length} email${emails.length === 1 ? '' : 's'} composed (mocked)`,
    }
  }

  if (emails.length === 0) {
    return { outcome: 'ok', detail: 'no emails to send' }
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: cfg.user, pass: cfg.pass },
  })

  const fromLine = `"${cfg.fromName}" <${cfg.user}>`
  let sent = 0
  let skippedNoAddress = 0
  const errors: string[] = []
  let authFailed = false

  for (const e of emails) {
    const recipients = e.to.filter((r) => Boolean(r.email))
    if (recipients.length === 0) {
      skippedNoAddress++
      continue
    }
    const toLine = recipients
      .map((r) => `"${r.name}" <${r.email}>`)
      .join(', ')
    const label = recipients.map((r) => r.name).join(', ')
    try {
      await transporter.sendMail({
        from: fromLine,
        to: toLine,
        subject: e.subject,
        text: e.body,
      })
      sent++
    } catch (err) {
      const code = (err as { code?: string }).code
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[email] failed for ${toLine}:`, code ?? '', message)
      if (code === 'EAUTH') {
        authFailed = true
        errors.push(
          `Gmail auth failed (${message}) — verify GMAIL_USER and the 16-char app password from myaccount.google.com/apppasswords`,
        )
        break
      }
      errors.push(`${label}: ${message}`)
    }
  }

  if (authFailed) {
    return { outcome: 'error', detail: errors.join('; ') }
  }

  if (sent === 0 && errors.length > 0) {
    return { outcome: 'error', detail: errors.join('; ') }
  }

  const parts: string[] = []
  if (sent > 0) parts.push(`sent ${sent} real email${sent === 1 ? '' : 's'}`)
  if (skippedNoAddress > 0) {
    parts.push(
      `skipped ${skippedNoAddress} (no email)`,
    )
  }
  if (errors.length > 0) {
    parts.push(`${errors.length} failed: ${errors.join('; ')}`)
  }

  return {
    outcome: errors.length > 0 ? 'error' : 'ok',
    detail: parts.join(' · '),
  }
}
