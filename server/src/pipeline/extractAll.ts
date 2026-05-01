import OpenAI from 'openai'
import type {
  DraftTask,
  DraftUpdate,
  TaskStatus,
  TranscriptSegment,
} from '../types.js'
import type { ExistingTaskInput } from './extract.js'
import type { WhisperSegment } from './transcribe.js'

export type ExtractAllResult = {
  segments: TranscriptSegment[]
  detectedSpeakers: string[]
  suggestedNames: Record<string, string | null>
  mom: string
  tasks: DraftTask[]
  updates: DraftUpdate[]
}

const MODEL = 'llama-3.3-70b-versatile'

const SYSTEM = `You receive a meeting transcript and produce a structured plan in one shot.

INPUT:
- today: ISO date string.
- participantRoster: array of { id, name }.
- existingTasks (optional): tasks already on the project, with id/description/ownerDisplayName/deadline/status.
- segments: array of [index, text] tuples in spoken order. The system has the timestamps locally — DO NOT copy timestamps in your output, only refer to segments by their integer index.

OUTPUT (return ONLY a JSON object, no prose, no code fences):

{
  "detectedSpeakers": ["Speaker 1", "Speaker 2"],
  "suggestedNames": { "Speaker 1": "Ana" or null, ... },
  "segments": [{ "i": 0, "speaker": "Speaker 1" }, { "i": 1, "speaker": "Speaker 2" }, ...],
  "mom": "...",
  "commitments": [{ "index": 1, "summary": "..." }, ...],
  "tasks": [{ "tempId": "t1", "description": "...", "ownerName": "...", "deadline": "yyyy-mm-dd"|null, "dependsOn": [], "notes": "..."|null }],
  "updates": [{ "taskId": "<existing-id>", "status": "done"|"in_progress"|"pending"|null, "deadline": "yyyy-mm-dd" }]
}

JOBS:

1. **Diarize**: Assign every input segment to a "Speaker N" label by adding one entry to \`segments\`: { "i": <input index>, "speaker": "Speaker N" }. Number speakers in order of first appearance. Prefer fewer speakers when ambiguous. EVERY input index must appear once in your output \`segments\`.

2. **Suggest names**: assign each "Speaker N" label a roster name (case-insensitive match) or null. Use these signals, in order of strength:

   - **Self-introduction** ("I'm Sarah", "This is Sarah here") → THE SPEAKER who utters this IS Sarah.
   - **Direct address / vocative** ("Thanks James", "James, can you…", "Hey James", "over to you James", "Deal. Thanks James.") → the OTHER party is James. The speaker who utters the line is NOT James — assign James to whichever Speaker label they are addressing.
   - **First-person ownership claim** ("I'm building the checklist UI", "I finished the welcome email") combined with a roster name elsewhere attributing that same work ("James is on the checklist UI") → the speaker making the first-person claim IS that named person.
   - **Third-person attribution about an absent party** ("Marcus is owning that", "Priya will run QA") → maps a name to someone NOT in this conversation; do NOT use it to label either speaker.

   When two signals conflict, vocative/direct-address evidence beats inference from work attribution. If a speaker can be identified by elimination (only one roster name unaccounted for after labeling the other speaker), assign it. If still ambiguous, return null for that speaker — never guess.

3. **MoM**: 2–3 paragraph past-tense recap. Refer to people as "Speaker 1", "Speaker 2" — the system substitutes real names after speaker confirmation.

4. **Tasks** — 3-step procedure:

   **Step A (MANDATORY) — Enumerate deliverables.** A "commitment" is a discrete piece of work a specific person agreed to produce. Walk the dialogue chronologically and list each deliverable once in \`commitments\`. Multiple statements about the same deliverable (status update + deadline + restatement) count as ONE entry. Number sequentially.

   **Before adding a commitment, check \`existingTasks\`.** If the deliverable being discussed matches one already in \`existingTasks\` (same owner + same deliverable, fuzzy-match descriptions), it is NOT a new commitment — do not add it. Status check-in meetings ("I finished X", "James is still working on Y", "Priya kicked off QA") almost always discuss existing tasks; route those to \`updates\` only, NOT to \`commitments\`/\`tasks\`. A deliverable enters \`commitments\` only if it is genuinely new work introduced in this meeting.

   What is NOT a commitment — exclude these from \`commitments\` entirely:
   - **Already-tracked work** (matches an entry in \`existingTasks\`) → emit an \`update\` if status/deadline/owner changed, else omit. Never re-create.
   - **Hand-offs / introductions** ("hand off X to Y", "loop in Y", "let Y know") → fold into the target deliverable's \`notes\`.
   - **Follow-ups / check-ins / confirmations** ("follow up with X", "confirm with X") → drop unless the dialogue makes it a real deliverable.
   - **Status reports / agenda mentions** ("send an update", "give a quick summary") → drop.
   - **Scheduling-only phrasing** ("target X for May 10", "aim to finish Friday") → that is the \`deadline\` on the underlying deliverable, not a separate item.
   - **Wait-for / blocked-by** ("wait for X", "until X is done") → express as \`dependsOn\`, not a "wait" commitment.

   **Step B — MoM** mentions every commitment.

   **Step C (MANDATORY) — Materialize tasks, then consolidate.** Convert each \`commitments\` entry to a task. After conversion, scan: if two tasks describe the same deliverable + same owner, merge into one (keep the most specific phrasing; combine \`notes\`, take the firmer \`deadline\`, union \`dependsOn\`). \`tasks.length\` MUST be \`<= commitments.length\` — merges are allowed; under-production (dropping a real deliverable) is not.

   **Worked example — hand-off case.** Dialogue: *"Once my work and the setup flow are done, I'll hand off the QA pass to Priya. Priya will run QA, May 15."* → ONE task: owner Priya, description "Run the QA pass on the onboarding flow", deadline May 15, \`dependsOn\` = [the two upstream tasks], \`notes\` = "James will hand off after his work and the account setup flow are done". NOT a separate "Hand off to Priya" task.

   **Worked example — status check-in (CRITICAL).** existingTasks contains \`{ id: "abc", description: "Build checklist UI component", ownerDisplayName: "James", deadline: "2026-05-12", status: "pending" }\`. Dialogue: *"Has James picked up the checklist UI?" — "He has, yeah. He said he got the content and he's building it now, so that's in progress. He's still on track for May 12th."* → \`commitments\` = [] (zero new), \`tasks\` = [] (zero new), \`updates\` = [{ taskId: "abc", status: "in_progress" }] (deadline key OMITTED because the dialogue confirms May 12 — does not change it). DO NOT emit a new task "Build checklist UI component" for James — that already exists.

   **Worked example — completion check-in.** existingTasks contains \`{ id: "xyz", description: "Build the account setup flow", ownerDisplayName: "James", ... }\`. Dialogue: *"James wrapped that up on May 10th as planned, so that's closed."* → \`tasks\` = [], \`updates\` = [{ taskId: "xyz", status: "done" }]. NOT a new "Build the account setup flow" task.

   Task fields:
   - "description": ONE imperative action sentence. No owner name, no "Speaker N" prefix.
     ✅ "Build the onboarding screen and welcome flow"   ❌ "Reza needs to build the onboarding screen"
   - "ownerName": the doer (not the announcer). Prefer a roster name when the dialogue names someone, else "Speaker N" if the doer is a speaker, else null. When speaker A says "B will do X", owner = B.
   - "deadline": ISO yyyy-mm-dd resolved against \`today\`, or null.
   - "tempId": "t1", "t2", ... unique in this response.
   - "dependsOn": array of tempIds. If the dialogue says "Y starts after X" then Y.dependsOn includes X (NOT the reverse). If the dialogue says "in parallel" / "independently" / "neither has to wait" / "both can start now", leave dependsOn EMPTY — do NOT cross-link parallel tasks.
   - "notes": optional 1–2 sentences for resources/links/constraints mentioned in the dialogue, OR a hand-off note absorbed from a coordination beat (see worked example), else null.

5. **Updates** — for tasks already in existingTasks, only when the dialogue explicitly says something changed.
   - "taskId": must be a real id from existingTasks (never invent).
   - "status": new status only if the dialogue indicates progress ("I finished X" → done). Null if unchanged.
   - "deadline": OMIT the key entirely unless the dialogue explicitly mentions a new date. Closing a task ("done") MUST NOT touch the deadline unless explicitly cleared.
   - Do NOT recreate an existing task as a new one — emit an update instead, or omit it.`

export async function extractAllFromTranscript(input: {
  today: string
  participants: Array<{ id: string; name: string }>
  existingTasks: ExistingTaskInput[]
  whisperSegments: WhisperSegment[]
}): Promise<ExtractAllResult> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set in .env')
  }
  if (input.whisperSegments.length === 0) {
    return {
      segments: [],
      detectedSpeakers: [],
      suggestedNames: {},
      mom: '',
      tasks: [],
      updates: [],
    }
  }

  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  })

  // Compact segment format: [index, text] tuples. Timestamps stay local.
  const compactSegments = input.whisperSegments.map(
    (s, i) => [i, s.text] as [number, string],
  )
  const userPayload: Record<string, unknown> = {
    today: input.today,
    participantRoster: input.participants,
    segments: compactSegments,
  }
  if (input.existingTasks.length > 0) {
    userPayload.existingTasks = input.existingTasks
  }
  // Compact JSON (no indentation) — saves more tokens
  const userContent = JSON.stringify(userPayload)

  const response = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    max_tokens: 8192,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: userContent },
    ],
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('Groq returned no text output')

  const parsed = parseJsonResponse(text)

  // Segments — LLM emits { i, speaker }; reconstruct from local Whisper output
  const rawSegments = Array.isArray(parsed.segments) ? parsed.segments : []
  const speakerByIndex = new Map<number, string>()
  for (const s of rawSegments) {
    const obj = s as Record<string, unknown>
    const i = Number(obj.i)
    const speaker = String(obj.speaker || 'Speaker 1')
    if (Number.isFinite(i) && i >= 0 && i < input.whisperSegments.length) {
      speakerByIndex.set(i, speaker)
    }
  }
  const segments: TranscriptSegment[] = input.whisperSegments.map((w, i) => ({
    start: w.start,
    end: w.end,
    speaker: speakerByIndex.get(i) ?? 'Speaker 1',
    text: w.text,
  }))

  // Speakers
  const detectedSpeakers: string[] = Array.isArray(parsed.detectedSpeakers)
    ? parsed.detectedSpeakers.map(String)
    : Array.from(new Set(segments.map((s) => s.speaker)))

  const suggestedNames: Record<string, string | null> = {}
  if (parsed.suggestedNames && typeof parsed.suggestedNames === 'object') {
    for (const [k, v] of Object.entries(
      parsed.suggestedNames as Record<string, unknown>,
    )) {
      suggestedNames[k] = typeof v === 'string' && v.trim() ? v.trim() : null
    }
  }
  for (const sp of detectedSpeakers) {
    if (!(sp in suggestedNames)) suggestedNames[sp] = null
  }

  // MoM
  const mom = typeof parsed.mom === 'string' ? parsed.mom.trim() : ''

  // Tasks
  const rawTasks = Array.isArray(parsed.tasks) ? parsed.tasks : []
  const tasks: DraftTask[] = rawTasks.map(
    (t: Record<string, unknown>, i: number) => {
      const ownerName =
        typeof t.ownerName === 'string' && t.ownerName.trim()
          ? t.ownerName.trim()
          : null
      return {
        tempId:
          typeof t.tempId === 'string' && t.tempId ? t.tempId : `t${i + 1}`,
        description:
          typeof t.description === 'string' ? t.description.trim() : '',
        ownerName,
        deadline:
          typeof t.deadline === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(t.deadline)
            ? t.deadline
            : null,
        dependsOn: Array.isArray(t.dependsOn)
          ? t.dependsOn.filter((x): x is string => typeof x === 'string')
          : [],
        notes:
          typeof t.notes === 'string' && t.notes.trim()
            ? t.notes.trim()
            : null,
      }
    },
  )

  // Commitments — debug scaffolding to detect under-production
  const rawCommitments = Array.isArray(parsed.commitments)
    ? parsed.commitments
    : []
  if (tasks.length > rawCommitments.length) {
    console.warn(
      `[extractAll] overproduced tasks: ${tasks.length} tasks for ${rawCommitments.length} commitments`,
    )
    for (const t of tasks) {
      console.warn(
        `  • ${JSON.stringify({ ownerName: t.ownerName, description: t.description })}`,
      )
    }
  } else if (rawCommitments.length > 0) {
    console.log(
      `[extractAll] commitments=${rawCommitments.length}, tasks=${tasks.length} (matched)`,
    )
  }

  // Updates
  const allowedStatuses: TaskStatus[] = ['pending', 'in_progress', 'done']
  const validIds = new Set(input.existingTasks.map((t) => t.id))
  const rawUpdates = Array.isArray(parsed.updates) ? parsed.updates : []
  const updates: DraftUpdate[] = rawUpdates
    .map((u: Record<string, unknown>): DraftUpdate | null => {
      const taskId = typeof u.taskId === 'string' ? u.taskId : null
      if (!taskId || !validIds.has(taskId)) return null
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
    .filter((x): x is DraftUpdate => x !== null)

  return { segments, detectedSpeakers, suggestedNames, mom, tasks, updates }
}

function parseJsonResponse(text: string): {
  detectedSpeakers?: unknown
  suggestedNames?: unknown
  segments?: unknown
  mom?: unknown
  commitments?: unknown
  tasks?: unknown
  updates?: unknown
} {
  const trimmed = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/```$/, '')
    .trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const first = trimmed.indexOf('{')
    const last = trimmed.lastIndexOf('}')
    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.slice(first, last + 1))
    }
    throw new Error('Could not parse extractAll response as JSON')
  }
}
