import type {
  DispatchResult,
  Meeting,
  MockedEmail,
  Project,
  Task,
} from '../types.js'
import { buildEmails } from './buildEmails.js'
import { dispatchToSlack } from './dispatchSlack.js'
import { dispatchToNotion } from './dispatchNotion.js'
import { dispatchEmails } from './dispatchEmail.js'

export type DispatchOutput = {
  emails: MockedEmail[]
  result: DispatchResult
}

export async function runDispatch(
  meeting: Meeting,
  project: Project,
  allProjectTasks: Task[],
): Promise<DispatchOutput> {
  const emails = buildEmails(meeting, project, allProjectTasks)

  const email = await dispatchEmails(emails).catch((err: unknown) => ({
    outcome: 'error' as const,
    detail: err instanceof Error ? err.message : String(err),
  }))

  const slack = await dispatchToSlack(meeting, project, allProjectTasks).catch(
    (err: unknown) => ({
      outcome: 'error' as const,
      detail: err instanceof Error ? err.message : String(err),
    }),
  )

  const notion = await dispatchToNotion(
    meeting,
    project,
    allProjectTasks,
  ).catch((err: unknown) => ({
    outcome: 'error' as const,
    detail: err instanceof Error ? err.message : String(err),
  }))

  const result: DispatchResult = {
    dispatchedAt: new Date().toISOString(),
    email,
    slack,
    notion,
  }

  return { emails, result }
}
