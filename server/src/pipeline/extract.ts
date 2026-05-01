import OpenAI from 'openai'
import type { TaskStatus } from '../types.js'

export type ExtractedTaskDraft = {
  tempId: string
  description: string
  ownerParticipantId: string | null
  deadline: string | null
  dependsOn: string[]
}

export type ExtractedTaskUpdate = {
  taskId: string
  status: TaskStatus | null
  deadline: string | null | undefined
}

export type ExistingTaskInput = {
  id: string
  description: string
  ownerDisplayName: string
  deadline: string | null
  status: TaskStatus
  sourceMeetingDate: string
}

export type ExtractionResult = {
  mom: string
  tasks: ExtractedTaskDraft[]
  updates: ExtractedTaskUpdate[]
}

export type DialogueLine = {
  speaker: string
  start: number
  end: number
  text: string
}

const MODEL = 'llama-3.3-70b-versatile'

const SYSTEM = `You extract a structured action plan from a meeting transcript.

You receive:
- today (ISO date yyyy-mm-dd)
- participants (id + name) — the only valid task owners
- existingTasks (the project's current task graph from prior meetings, each with a real id, description, owner, deadline, status, sourceMeetingDate)
- dialogue (array of { speaker, start, end, text }) — speaker names are real people

Produce:
1. A 2–3 paragraph **Minutes of Meeting** summary covering the main decisions, context, and outcomes. Neutral tone, past tense, no fluff. If existing tasks were closed or had deadlines shifted in this meeting, mention those changes naturally in the MoM.
2. A list of **tasks** — only brand-new action items introduced in this meeting that don't already exist in existingTasks.
3. A list of **updates** — changes to existingTasks driven by what was said.

For each new task in "tasks":
- "description": one-sentence description ("Design the landing page mockup").
- "ownerParticipantId": id from the participant roster, or null.
- "deadline": ISO yyyy-mm-dd if a date or relative date was mentioned (resolve using "today"). Null if no deadline.
- "tempId": "t1", "t2", … unique per task in this response.
- "dependsOn": array of tempIds from THIS response (not existing task ids). Only when the transcript explicitly establishes order.

For each update in "updates":
- "taskId": the real id from existingTasks. Never invent ids.
- "status": new status ("pending" | "in_progress" | "done") if the dialogue indicates progress ("I finished X" → "done"; "I started X" → "in_progress"; "we need to redo X" → "pending"). Null if status didn't change.
- "deadline": ONLY include this field if the dialogue EXPLICITLY mentioned a new date for that task ("let's push X to next Friday", "X is now due on May 10"). OMIT the field entirely (do not write null, do not write the old value) if the deadline wasn't mentioned in the dialogue. Especially: when you close a task by setting status to "done", DO NOT touch the deadline unless the dialogue explicitly says to clear or change it.

Critical rules:
- Do NOT recreate a task that already exists in existingTasks. Emit an update if anything about it changed; otherwise omit it from both arrays.
- Do NOT invent existingTask ids.
- Only emit an update when the dialogue makes the change explicit. Do not infer status from silence.
- Match existing tasks semantically (description + owner). If unsure whether a phrase refers to an existing task, prefer creating a new one over guessing an update.
- An update should only contain fields that genuinely changed. If only the status changed, the JSON object for that update should NOT include the "deadline" key at all.

Worked example — status check-in (CRITICAL): existingTasks contains { id: "abc", description: "Build checklist UI component", ownerDisplayName: "James", deadline: "2026-05-12", status: "pending" }. Dialogue: "Has James picked up the checklist UI?" — "He has, yeah. He said he got the content and he's building it now, so that's in progress. He's still on track for May 12th." → tasks: [] (zero new), updates: [{ taskId: "abc", status: "in_progress" }] (deadline key OMITTED — May 12 was confirmed, not changed). DO NOT create a new task "Build checklist UI component" for James — it already exists.

Worked example — completion: existingTasks contains { id: "xyz", description: "Build the account setup flow", ownerDisplayName: "James", ... }. Dialogue: "James wrapped that up on May 10th as planned, so that's closed." → tasks: [], updates: [{ taskId: "xyz", status: "done" }]. Not a new task.

Return ONLY a JSON object with this shape, no prose, no code fences:

{
  "mom": "string",
  "tasks": [
    { "tempId": "t1", "description": "string", "ownerParticipantId": "string-or-null", "deadline": "yyyy-mm-dd-or-null", "dependsOn": [] }
  ],
  "updates": [
    { "taskId": "<existing-id>", "status": "done", "deadline": "yyyy-mm-dd" }
  ]
}`

export async function extractTasks(input: {
  today: string
  participants: Array<{ id: string; name: string }>
  existingTasks: ExistingTaskInput[]
  dialogue: DialogueLine[]
}): Promise<ExtractionResult> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set in .env')
  }
  if (input.dialogue.length === 0) {
    return { mom: '', tasks: [], updates: [] }
  }

  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  })

  const response = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: JSON.stringify(input, null, 2) },
    ],
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('Groq returned no text output')

  const parsed = parseJsonResponse(text)

  const mom = typeof parsed.mom === 'string' ? parsed.mom.trim() : ''
  const rawTasks = Array.isArray(parsed.tasks) ? parsed.tasks : []
  const rawUpdates = Array.isArray(parsed.updates) ? parsed.updates : []

  const tasks: ExtractedTaskDraft[] = rawTasks.map(
    (t: Record<string, unknown>, i: number) => ({
      tempId:
        typeof t.tempId === 'string' && t.tempId ? t.tempId : `t${i + 1}`,
      description: typeof t.description === 'string' ? t.description.trim() : '',
      ownerParticipantId:
        typeof t.ownerParticipantId === 'string' && t.ownerParticipantId
          ? t.ownerParticipantId
          : null,
      deadline:
        typeof t.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.deadline)
          ? t.deadline
          : null,
      dependsOn: Array.isArray(t.dependsOn)
        ? t.dependsOn.filter((x): x is string => typeof x === 'string')
        : [],
    }),
  )

  const allowedStatuses: TaskStatus[] = ['pending', 'in_progress', 'done']
  const updates: ExtractedTaskUpdate[] = rawUpdates
    .map((u: Record<string, unknown>): ExtractedTaskUpdate | null => {
      const taskId = typeof u.taskId === 'string' ? u.taskId : null
      if (!taskId) return null
      const statusRaw = u.status
      const status =
        typeof statusRaw === 'string' &&
        allowedStatuses.includes(statusRaw as TaskStatus)
          ? (statusRaw as TaskStatus)
          : null
      const deadlineRaw = u.deadline
      let deadline: string | null | undefined
      if (deadlineRaw === undefined || !('deadline' in u)) {
        deadline = undefined
      } else if (deadlineRaw === null) {
        deadline = null
      } else if (
        typeof deadlineRaw === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(deadlineRaw)
      ) {
        deadline = deadlineRaw
      } else {
        deadline = undefined
      }
      return { taskId, status, deadline }
    })
    .filter((x): x is ExtractedTaskUpdate => x !== null)

  return { mom, tasks, updates }
}

function parseJsonResponse(text: string): {
  mom?: unknown
  tasks?: unknown
  updates?: unknown
} {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const first = trimmed.indexOf('{')
    const last = trimmed.lastIndexOf('}')
    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.slice(first, last + 1))
    }
    throw new Error('Could not parse extraction response as JSON')
  }
}
