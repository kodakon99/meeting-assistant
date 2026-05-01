import fs from 'node:fs'
import path from 'node:path'
import OpenAI from 'openai'
import { UPLOADS_DIR } from '../storage.js'

export type WhisperSegment = {
  start: number
  end: number
  text: string
}

export type WhisperResult = {
  language: string | null
  fullText: string
  segments: WhisperSegment[]
}

export async function transcribeAudio(
  audioFilename: string,
): Promise<WhisperResult> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set in .env')
  }
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  })
  const filePath = path.join(UPLOADS_DIR, audioFilename)

  const response = await client.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: 'whisper-large-v3-turbo',
    response_format: 'verbose_json',
    language: 'en',
  })

  const raw = response as unknown as {
    language?: string
    text?: string
    segments?: Array<{ start: number; end: number; text: string }>
  }

  const segments = (raw.segments ?? []).map((s) => ({
    start: s.start,
    end: s.end,
    text: s.text.trim(),
  }))

  return {
    language: raw.language ?? null,
    fullText: (raw.text ?? '').trim(),
    segments,
  }
}
