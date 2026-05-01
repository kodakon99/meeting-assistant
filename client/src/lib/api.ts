import type {
  DispatchPreview,
  Meeting,
  MockedEmail,
  Project,
  Task,
  Transcript,
} from './types'

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

export type SpeakerAssignmentInput = {
  participantId: string | null
}

export const api = {
  listProjects(): Promise<Project[]> {
    return fetch('/api/projects').then((r) => handle<Project[]>(r))
  },

  getProject(id: string): Promise<Project> {
    return fetch(`/api/projects/${id}`).then((r) => handle<Project>(r))
  },

  createProject(name: string, participantNames: string[]): Promise<Project> {
    return fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, participantNames }),
    }).then((r) => handle<Project>(r))
  },

  deleteProject(projectId: string): Promise<void> {
    return fetch(`/api/projects/${projectId}`, { method: 'DELETE' }).then(
      (r) => {
        if (!r.ok && r.status !== 204) {
          throw new Error(`HTTP ${r.status}`)
        }
      },
    )
  },

  listMeetings(projectId: string): Promise<Meeting[]> {
    return fetch(`/api/projects/${projectId}/meetings`).then((r) =>
      handle<Meeting[]>(r),
    )
  },

  getMeeting(meetingId: string): Promise<Meeting> {
    return fetch(`/api/meetings/${meetingId}`).then((r) => handle<Meeting>(r))
  },

  audioUrl(meetingId: string): string {
    return `/api/meetings/${meetingId}/audio`
  },

  deleteMeeting(meetingId: string): Promise<void> {
    return fetch(`/api/meetings/${meetingId}`, { method: 'DELETE' }).then(
      (r) => {
        if (!r.ok && r.status !== 204) {
          throw new Error(`HTTP ${r.status}`)
        }
      },
    )
  },

  getTranscript(meetingId: string): Promise<Transcript> {
    return fetch(`/api/meetings/${meetingId}/transcript`).then((r) =>
      handle<Transcript>(r),
    )
  },

  saveSpeakerMap(
    meetingId: string,
    assignments: Record<string, SpeakerAssignmentInput>,
  ): Promise<Meeting> {
    return fetch(`/api/meetings/${meetingId}/speaker-map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments }),
    }).then((r) => handle<Meeting>(r))
  },

  listMeetingTasks(meetingId: string): Promise<Task[]> {
    return fetch(`/api/meetings/${meetingId}/tasks`).then((r) =>
      handle<Task[]>(r),
    )
  },

  listProjectTasks(projectId: string): Promise<Task[]> {
    return fetch(`/api/projects/${projectId}/tasks`).then((r) =>
      handle<Task[]>(r),
    )
  },

  createTask(
    meetingId: string,
    payload: Partial<Task> = {},
  ): Promise<Task> {
    return fetch(`/api/meetings/${meetingId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => handle<Task>(r))
  },

  updateTask(taskId: string, patch: Partial<Task>): Promise<Task> {
    return fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then((r) => handle<Task>(r))
  },

  deleteTask(taskId: string): Promise<void> {
    return fetch(`/api/tasks/${taskId}`, { method: 'DELETE' }).then((r) => {
      if (!r.ok && r.status !== 204) {
        throw new Error(`HTTP ${r.status}`)
      }
    })
  },

  updateMeetingMom(meetingId: string, mom: string | null): Promise<Meeting> {
    return fetch(`/api/meetings/${meetingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mom }),
    }).then((r) => handle<Meeting>(r))
  },

  addParticipant(projectId: string, name: string): Promise<Project> {
    return fetch(`/api/projects/${projectId}/participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then((r) => handle<Project>(r))
  },

  updateParticipantEmail(
    projectId: string,
    participantId: string,
    email: string | null,
  ): Promise<Project> {
    return fetch(
      `/api/projects/${projectId}/participants/${participantId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      },
    ).then((r) => handle<Project>(r))
  },

  getDispatchPreview(meetingId: string): Promise<DispatchPreview> {
    return fetch(`/api/meetings/${meetingId}/dispatch-preview`).then((r) =>
      handle<DispatchPreview>(r),
    )
  },

  dispatchMeeting(
    meetingId: string,
  ): Promise<{ meeting: Meeting; emails: MockedEmail[] }> {
    return fetch(`/api/meetings/${meetingId}/dispatch`, {
      method: 'POST',
    }).then((r) => handle<{ meeting: Meeting; emails: MockedEmail[] }>(r))
  },

  uploadMeeting(
    projectId: string,
    audio: Blob,
    filename: string,
    durationSeconds: number | null,
  ): Promise<Meeting> {
    const fd = new FormData()
    fd.append('audio', audio, filename)
    if (durationSeconds != null) {
      fd.append('durationSeconds', String(durationSeconds))
    }
    return fetch(`/api/projects/${projectId}/meetings`, {
      method: 'POST',
      body: fd,
    }).then((r) => handle<Meeting>(r))
  },
}
