import OpenAI from 'openai'
import type { TranscriptSegment } from '../types.js'
import type { WhisperSegment } from './transcribe.js'

export type DiarizationResult = {
  segments: TranscriptSegment[]
  detectedSpeakers: string[]
  suggestedNames: Record<string, string | null>
}

const MODEL = 'llama-3.3-70b-versatile'

const SYSTEM = `You are helping diarize a meeting transcript.

You receive an array of time-stamped segments from an automatic transcription (no speaker labels yet). Your job:

1. Group consecutive segments into speaker turns using conversational cues (pronoun shifts, question/answer patterns, topic switches, explicit names). Merge segments that belong to the same speaker; split if a segment clearly contains two speakers.
2. Assign speaker labels as "Speaker 1", "Speaker 2", ... in order of first appearance. Prefer fewer speakers when ambiguous. Do NOT invent speakers beyond what the conversation supports.
3. If the transcript contains self-introductions ("I'm Rian", "this is Ana speaking") or direct address ("Rian, what do you think?"), map each speaker to that name — but ONLY if the name matches one in the provided participant roster (case-insensitive). Otherwise leave the suggested name as null.

Return ONLY a JSON object with this exact shape:

{
  "segments": [
    { "start": 0.0, "end": 3.2, "speaker": "Speaker 1", "text": "..." }
  ],
  "detectedSpeakers": ["Speaker 1", "Speaker 2"],
  "suggestedNames": { "Speaker 1": "Rian", "Speaker 2": null }
}

Preserve every piece of text from the input — don't drop content. Use exact segment start/end timestamps from the input (if you merge, use the earliest start and latest end).`

export async function diarizeTranscript(
  whisperSegments: WhisperSegment[],
  participantNames: string[],
): Promise<DiarizationResult> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set in .env')
  }
  if (whisperSegments.length === 0) {
    return { segments: [], detectedSpeakers: [], suggestedNames: {} }
  }

  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  })
  const userContent = JSON.stringify(
    {
      participantRoster: participantNames,
      segments: whisperSegments,
    },
    null,
    2,
  )

  const response = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: userContent },
    ],
  })

  const text = response.choices[0]?.message?.content
  if (!text) {
    throw new Error('Groq returned no text output')
  }
  const parsed = parseJsonResponse(text)

  const segments: TranscriptSegment[] = Array.isArray(parsed.segments)
    ? parsed.segments.map((s: TranscriptSegment) => ({
        start: Number(s.start),
        end: Number(s.end),
        speaker: String(s.speaker),
        text: String(s.text).trim(),
      }))
    : []

  const detectedSpeakers: string[] = Array.isArray(parsed.detectedSpeakers)
    ? parsed.detectedSpeakers.map(String)
    : Array.from(new Set(segments.map((s) => s.speaker)))

  const suggestedNames: Record<string, string | null> = {}
  if (parsed.suggestedNames && typeof parsed.suggestedNames === 'object') {
    for (const [k, v] of Object.entries(parsed.suggestedNames)) {
      suggestedNames[k] = typeof v === 'string' && v.trim() ? v.trim() : null
    }
  }
  for (const sp of detectedSpeakers) {
    if (!(sp in suggestedNames)) suggestedNames[sp] = null
  }

  return { segments, detectedSpeakers, suggestedNames }
}

function parseJsonResponse(text: string): {
  segments?: TranscriptSegment[]
  detectedSpeakers?: string[]
  suggestedNames?: Record<string, unknown>
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
    throw new Error('Could not parse Groq response as JSON')
  }
}
