import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Task, Transcript } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '..', 'data')
const TRANSCRIPTS_DIR = path.join(DATA_DIR, 'transcripts')
export const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads')

await fs.mkdir(DATA_DIR, { recursive: true })
await fs.mkdir(TRANSCRIPTS_DIR, { recursive: true })
await fs.mkdir(UPLOADS_DIR, { recursive: true })

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  const full = path.join(DATA_DIR, file)
  try {
    const raw = await fs.readFile(full, 'utf8')
    return JSON.parse(raw) as T
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw err
  }
}

export async function writeJson<T>(file: string, data: T): Promise<void> {
  const full = path.join(DATA_DIR, file)
  await fs.writeFile(full, JSON.stringify(data, null, 2), 'utf8')
}

function transcriptPath(meetingId: string): string {
  return path.join(TRANSCRIPTS_DIR, `${meetingId}.json`)
}

export async function readTranscript(
  meetingId: string,
): Promise<Transcript | null> {
  try {
    const raw = await fs.readFile(transcriptPath(meetingId), 'utf8')
    return JSON.parse(raw) as Transcript
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export async function writeTranscript(transcript: Transcript): Promise<void> {
  await fs.writeFile(
    transcriptPath(transcript.meetingId),
    JSON.stringify(transcript, null, 2),
    'utf8',
  )
}

export async function deleteTranscript(meetingId: string): Promise<void> {
  try {
    await fs.unlink(transcriptPath(meetingId))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}

const TASKS_FILE = 'tasks.json'

export async function readTasks(): Promise<Task[]> {
  return readJson<Task[]>(TASKS_FILE, [])
}

export async function writeTasks(tasks: Task[]): Promise<void> {
  await writeJson(TASKS_FILE, tasks)
}
