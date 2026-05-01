export type Participant = {
  id: string
  name: string
  email: string | null
}

export type Project = {
  id: string
  name: string
  participants: Participant[]
  createdAt: string
}

export type MeetingStatus =
  | 'uploaded'
  | 'transcribing'
  | 'transcription_failed'
  | 'awaiting_speaker_confirmation'
  | 'speakers_confirmed'
  | 'extracting'
  | 'extraction_failed'
  | 'draft'
  | 'dispatched'

export type SpeakerAssignment = {
  participantId: string | null
  displayName: string
}

export type Meeting = {
  id: string
  projectId: string
  audioFilename: string
  audioMimeType: string
  audioSizeBytes: number
  durationSeconds: number | null
  status: MeetingStatus
  createdAt: string
  transcribedAt?: string | null
  transcriptionError?: string | null
  detectedSpeakers?: string[]
  suggestedNames?: Record<string, string | null>
  speakerMap?: Record<string, SpeakerAssignment>
  mom?: string | null
  extractionError?: string | null
  extractedAt?: string | null
  taskUpdates?: TaskUpdate[]
  dispatch?: DispatchResult
  momDraft?: string | null
  tasksDraft?: DraftTask[]
  updatesDraft?: DraftUpdate[]
}

export type TaskStatus = 'pending' | 'in_progress' | 'done'

export type DraftTask = {
  tempId: string
  description: string
  ownerName: string | null
  deadline: string | null
  dependsOn: string[]
  notes: string | null
}

export type DraftUpdate = {
  taskId: string
  status: TaskStatus | null
  deadline: string | null | undefined
}

export type TaskUpdate = {
  taskId: string
  description: string
  before: { status: TaskStatus; deadline: string | null }
  after: { status: TaskStatus; deadline: string | null }
}

export type DispatchOutcome = 'ok' | 'not_configured' | 'error'

export type DispatchIntegrationResult = {
  outcome: DispatchOutcome
  detail?: string
  link?: string | null
}

export type DispatchResult = {
  dispatchedAt: string
  slack: DispatchIntegrationResult
  notion: DispatchIntegrationResult
  email: DispatchIntegrationResult
}

export type MockedEmail = {
  to: Array<{ participantId: string; name: string; email: string | null }>
  subject: string
  body: string
}

export type SlackMessagePreview = {
  participantId: string
  participantName: string
  email: string | null
  text: string
  channelId: string | null
}

export type NotionRowPreview = {
  taskId: string
  description: string
  ownerName: string
  deadline: string | null
  status: TaskStatus
}

export type DispatchPreview = {
  emails: MockedEmail[]
  slackMessages: SlackMessagePreview[]
  notionRows: NotionRowPreview[]
  integrationsConfigured: { slack: boolean; notion: boolean }
}

export type Task = {
  id: string
  projectId: string
  sourceMeetingId: string
  description: string
  ownerParticipantId: string | null
  ownerDisplayName: string
  status: TaskStatus
  deadline: string | null
  dependsOn: string[]
  createdAt: string
  updatedAt: string
  notionPageId?: string | null
  suggestedOwnerName?: string | null
  notes?: string | null
}

export type TranscriptSegment = {
  start: number
  end: number
  speaker: string
  text: string
}

export type Transcript = {
  meetingId: string
  language: string | null
  fullText: string
  segments: TranscriptSegment[]
}
