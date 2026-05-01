import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import type { Meeting, MeetingStatus, Project } from '../../lib/types'
import { Spectrum, useAnalyserSpectrum, useSimulatedSpectrum } from './Spectrum'
import { LiveTranscript } from './LiveTranscript'
import { PIPELINE_STAGES, Pipeline } from './Pipeline'

type Mode = 'idle' | 'recording' | 'processing' | 'done'

const MAX_SECONDS = 6 * 60

const STATUS_TO_STAGE_IDX: Partial<Record<MeetingStatus, number>> = {
  uploaded: 1,
  transcribing: 1,
  awaiting_speaker_confirmation: 2,
  speakers_confirmed: 3,
  extracting: 3,
  draft: 4,
  dispatched: 4,
}

function fmt(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function getAudioDuration(file: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.src = url
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      const d = audio.duration
      resolve(Number.isFinite(d) ? d : Number.NaN)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read audio metadata'))
    }
  })
}

type Props = {
  project: Project
  onMeetingCreated?: (meeting: Meeting) => void
  onReset?: () => void
}

export function LiveRecorder({ project, onMeetingCreated, onReset }: Props) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [stageProgress, setStageProgress] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const pollRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null)
  const [dragActive, setDragActive] = useState(false)

  const realSpectrum = useAnalyserSpectrum(activeStream)
  const simSpectrum = useSimulatedSpectrum(
    mode === 'recording' && !activeStream,
  )
  const spectrum = activeStream ? realSpectrum : simSpectrum

  // recording timer
  useEffect(() => {
    if (mode !== 'recording') return
    timerRef.current = window.setInterval(() => {
      setElapsed((e) => {
        const next = e + 1
        if (next >= MAX_SECONDS) handleStop()
        return next
      })
    }, 1000)
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Synthetic progress within active stage so the bar always feels alive.
  useEffect(() => {
    if (mode !== 'processing') return
    setStageProgress(0)
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      setStageProgress((p) => Math.min(0.92, p + dt * 0.45))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mode, meeting?.status])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop()
        } catch {
          // ignore
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (timerRef.current) window.clearInterval(timerRef.current)
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [])

  function startPolling(mid: string) {
    if (pollRef.current) window.clearInterval(pollRef.current)
    pollRef.current = window.setInterval(async () => {
      try {
        const m = await api.getMeeting(mid)
        setMeeting(m)
        if (
          m.status === 'awaiting_speaker_confirmation' ||
          m.status === 'draft' ||
          m.status === 'dispatched' ||
          m.status === 'transcription_failed' ||
          m.status === 'extraction_failed'
        ) {
          if (pollRef.current) {
            window.clearInterval(pollRef.current)
            pollRef.current = null
          }
          setStageProgress(1)
          if (
            m.status === 'transcription_failed' ||
            m.status === 'extraction_failed'
          ) {
            setError(
              m.transcriptionError ?? m.extractionError ?? 'Processing failed',
            )
            setMode('idle')
            return
          }
          setMode('done')
        }
      } catch {
        // swallow; next tick retries
      }
    }, 2500)
  }

  async function handleStart() {
    setError(null)
    setElapsed(0)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      setActiveStream(stream)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      )
      chunksRef.current = []
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data)
      }
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        setActiveStream(null)
        let duration: number | null = null
        try {
          const d = await getAudioDuration(blob)
          duration = Number.isFinite(d) ? d : null
        } catch {
          duration = null
        }
        await uploadAndProcess(blob, `recording-${Date.now()}.webm`, duration)
      }
      recorder.start()
      recorderRef.current = recorder
      setMode('recording')
    } catch (err) {
      setError((err as Error).message || 'Microphone access denied')
    }
  }

  function handleStop() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    setMode('processing')
  }

  function handleCancel() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop()
      } catch {
        // ignore
      }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setActiveStream(null)
    chunksRef.current = []
    setMode('idle')
    setElapsed(0)
  }

  async function uploadAndProcess(
    blob: Blob,
    filename: string,
    durationSeconds: number | null,
  ) {
    try {
      setMode('processing')
      const m = await api.uploadMeeting(
        project.id,
        blob,
        filename,
        durationSeconds,
      )
      setMeeting(m)
      onMeetingCreated?.(m)
      startPolling(m.id)
    } catch (err) {
      setError((err as Error).message)
      setMode('idle')
    }
  }

  async function handleFile(file: File) {
    setError(null)
    if (!file.type.startsWith('audio/')) {
      setError('Please choose an audio file.')
      return
    }
    let duration: number | null = null
    try {
      const d = await getAudioDuration(file)
      duration = Number.isFinite(d) ? d : null
      if (duration != null && duration > MAX_SECONDS) {
        setError(
          `Audio is ${fmt(duration)} — max length is ${fmt(MAX_SECONDS)}.`,
        )
        return
      }
    } catch {
      duration = null
    }
    await uploadAndProcess(file, file.name, duration)
  }

  function handleReset() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
    setMode('idle')
    setElapsed(0)
    setStageProgress(0)
    setMeeting(null)
    setError(null)
    onReset?.()
  }

  const stageIdx = useMemo(() => {
    if (mode === 'recording') return 0
    if (mode === 'idle') return 0
    if (mode === 'done') return PIPELINE_STAGES.length
    if (!meeting) return 1
    return STATUS_TO_STAGE_IDX[meeting.status] ?? 1
  }, [mode, meeting])

  const doneIdxs = useMemo(() => {
    const arr: number[] = []
    if (mode === 'done') {
      for (let i = 0; i < PIPELINE_STAGES.length; i++) arr.push(i)
      return arr
    }
    for (let i = 0; i < stageIdx; i++) arr.push(i)
    return arr
  }, [stageIdx, mode])

  const title =
    mode === 'idle'
      ? 'Capture a meeting'
      : mode === 'recording'
        ? 'Listening…'
        : mode === 'processing'
          ? meeting?.status === 'awaiting_speaker_confirmation'
            ? 'Speakers detected — confirm to continue'
            : 'Turning audio into actions'
          : 'Draft is ready'

  const taskCount = meeting?.tasksDraft?.length ?? 0
  const updateCount = meeting?.updatesDraft?.length ?? 0

  function gotoNextStep() {
    if (!meeting) return
    if (meeting.status === 'awaiting_speaker_confirmation') {
      navigate(`/projects/${project.id}/meetings/${meeting.id}/confirm`)
    } else if (meeting.status === 'draft') {
      navigate(`/projects/${project.id}/meetings/${meeting.id}/draft`)
    } else if (meeting.status === 'dispatched') {
      navigate(`/projects/${project.id}/meetings/${meeting.id}/dispatch`)
    }
  }

  return (
    <section
      className="relative rounded-hero overflow-hidden shadow-lg isolate"
      style={{
        background: 'oklch(0.16 0.04 280)',
        color: 'oklch(0.97 0.01 270)',
      }}
      onDragOver={(e) => {
        if (mode !== 'idle') return
        e.preventDefault()
        setDragActive(true)
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        if (mode !== 'idle') return
        e.preventDefault()
        setDragActive(false)
        const file = e.dataTransfer.files[0]
        if (file) void handleFile(file)
      }}
    >
      {/* Mesh background */}
      <div className="absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <span className="absolute rounded-full blur-[60px] opacity-70 recorder-mesh-1 animate-ma-drift w-[520px] h-[520px] -left-[100px] -top-[160px]" />
        <span
          className="absolute rounded-full blur-[60px] opacity-70 recorder-mesh-2 animate-ma-drift w-[460px] h-[460px] -right-[120px] -top-[80px]"
          style={{ animationDelay: '-6s' }}
        />
        <span
          className="absolute rounded-full blur-[60px] opacity-70 recorder-mesh-3 animate-ma-drift w-[380px] h-[380px] left-[38%] top-[40%]"
          style={{ animationDelay: '-11s' }}
        />
      </div>

      <div className="relative z-[1] px-8 pt-7 pb-7">
        <header className="flex items-end justify-between mb-5">
          <div>
            <p
              className="m-0 mb-1 text-[11px] uppercase tracking-[0.14em]"
              style={{ color: 'oklch(0.78 0.04 280)' }}
            >
              {project.name}
            </p>
            <h2 className="m-0 text-[28px] font-semibold tracking-tight text-gradient-recorder">
              {title}
            </h2>
          </div>
          <div
            className="flex items-center gap-2.5 text-[12px]"
            style={{ color: 'oklch(0.78 0.02 270)' }}
          >
            <span className="font-mono font-tabular">
              {fmt(mode === 'idle' ? 0 : elapsed)}
            </span>
            <span
              className="w-[3px] h-[3px] bg-current rounded-full opacity-50"
            />
            <span>max 6:00</span>
          </div>
        </header>

        <div className="min-h-[220px]">
          {/* IDLE */}
          {mode === 'idle' && (
            <div className="flex flex-col items-center gap-5 py-3.5 animate-ma-fade-in">
              <button
                className="relative w-[116px] h-[116px] bg-transparent border-0 cursor-pointer inline-flex items-center justify-center text-recorder-fg group"
                onClick={handleStart}
              >
                <span className="absolute inset-0 rounded-full bg-radial-record-halo animate-ma-rec-pulse" />
                <span className="absolute inset-[22px] rounded-full bg-gradient-record transition-transform group-hover:scale-[1.06] shadow-[0_14px_40px_-12px_oklch(0.65_0.22_18_/_0.65),inset_0_1px_0_oklch(1_0_0_/_0.3)]" />
                <span
                  className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[12px] whitespace-nowrap"
                  style={{ color: 'oklch(0.85 0.02 270)' }}
                >
                  Start recording
                </span>
              </button>
              <div
                className={`flex gap-4.5 flex-wrap justify-center text-[12px] mt-5 ${
                  dragActive ? 'opacity-100' : ''
                }`}
                style={{
                  color: 'oklch(0.72 0.02 270)',
                  gap: '18px',
                }}
              >
                <button
                  type="button"
                  className="px-2.5 py-1 rounded-pill border bg-transparent text-current cursor-pointer hover:opacity-100"
                  style={{
                    background: 'oklch(1 0 0 / 0.06)',
                    borderColor: 'oklch(1 0 0 / 0.08)',
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  upload an audio file
                </button>
                <span
                  className="px-2.5 py-1 rounded-pill border"
                  style={{
                    background: 'oklch(1 0 0 / 0.06)',
                    borderColor: 'oklch(1 0 0 / 0.08)',
                  }}
                >
                  drag &amp; drop anywhere
                </span>
                <span
                  className="px-2.5 py-1 rounded-pill border"
                  style={{
                    background: 'oklch(1 0 0 / 0.06)',
                    borderColor: 'oklch(1 0 0 / 0.08)',
                  }}
                >
                  max 6:00
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleFile(file)
                  e.target.value = ''
                }}
              />
            </div>
          )}

          {/* RECORDING */}
          {mode === 'recording' && (
            <div className="flex flex-col gap-4 animate-ma-fade-in">
              <Spectrum values={spectrum} />
              <div className="flex items-center gap-3 justify-center">
                <button
                  className="inline-flex items-center gap-1.5 rounded-btn px-3 py-1.5 text-[13px] font-semibold border transition"
                  style={{
                    background: 'transparent',
                    borderColor: 'oklch(1 0 0 / 0.15)',
                    color: 'oklch(0.85 0.02 270)',
                  }}
                  onClick={handleCancel}
                >
                  Cancel
                </button>
                <button
                  className="inline-flex items-center gap-1.5 rounded-btn px-3.5 py-1.5 text-[13px] font-semibold border transition"
                  style={{
                    background: 'oklch(0.95 0.06 18)',
                    color: 'oklch(0.40 0.18 18)',
                    borderColor: 'oklch(0.85 0.10 18)',
                  }}
                  onClick={handleStop}
                >
                  <span
                    className="inline-block w-[9px] h-[9px] bg-current rounded-[2px]"
                  />
                  Stop &amp; process
                </button>
                <span
                  className="inline-flex items-center gap-1.5 text-[12px] ml-1.5"
                  style={{ color: 'oklch(0.85 0.04 18)' }}
                >
                  <span
                    className="w-2 h-2 rounded-full animate-ma-pulse"
                    style={{ background: 'oklch(0.65 0.22 18)' }}
                  />
                  recording
                </span>
              </div>
              <LiveTranscript active />
            </div>
          )}

          {/* PROCESSING */}
          {mode === 'processing' && (
            <div className="px-1 py-2 animate-ma-fade-in">
              <Pipeline
                stages={PIPELINE_STAGES}
                activeIdx={stageIdx}
                doneIdxs={doneIdxs}
                currentProgress={stageProgress}
              />
              {meeting?.status === 'awaiting_speaker_confirmation' && (
                <div className="mt-5 flex justify-center gap-2.5">
                  <button
                    className="inline-flex items-center gap-2 rounded-btn px-3.5 py-2 text-[13px] font-semibold bg-gradient-accent text-white shadow-accent hover:-translate-y-px hover:shadow-accent-hover transition"
                    onClick={gotoNextStep}
                  >
                    Confirm speakers →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* DONE */}
          {mode === 'done' && (
            <div className="relative flex flex-col items-center gap-3 pt-4 pb-1 animate-ma-fade-in">
              <div
                className="absolute inset-0 pointer-events-none flex items-center justify-center"
                aria-hidden
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <span
                    key={i}
                    className="absolute w-1.5 h-1.5 rounded-full animate-ma-burst"
                    style={
                      {
                        background: `oklch(0.78 0.16 ${150 + i * 18})`,
                        '--angle': `${i * 30}deg`,
                        animationDelay: '0.15s',
                      } as React.CSSProperties
                    }
                  />
                ))}
              </div>
              <div
                className="animate-ma-pop"
                style={{ color: 'oklch(0.85 0.13 152)' }}
              >
                <svg viewBox="0 0 24 24" width="38" height="38" aria-hidden>
                  <circle
                    cx="12"
                    cy="12"
                    r="11"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                      strokeDasharray: 70,
                      strokeDashoffset: 70,
                      animation:
                        'ma-draw 0.7s ease-out 0.05s forwards',
                    }}
                  />
                  <path
                    d="M6.5 12.5 L10.5 16.5 L17.5 8.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      strokeDasharray: 22,
                      strokeDashoffset: 22,
                      animation:
                        'ma-draw 0.4s ease-out 0.45s forwards',
                    }}
                  />
                </svg>
              </div>
              <p
                className="m-0 mt-1 text-lg font-semibold tracking-tight"
                style={{ color: 'oklch(0.97 0.01 270)' }}
              >
                {meeting?.status === 'awaiting_speaker_confirmation'
                  ? 'Speakers detected — ready to confirm'
                  : `${taskCount} task${taskCount === 1 ? '' : 's'} extracted${
                      updateCount
                        ? `, ${updateCount} update${updateCount === 1 ? '' : 's'} detected`
                        : ''
                    }`}
              </p>
              <p
                className="m-0 text-[13px]"
                style={{ color: 'oklch(0.72 0.02 270)' }}
              >
                {meeting?.status === 'awaiting_speaker_confirmation'
                  ? 'Match each speaker to a participant to continue.'
                  : 'Draft minutes are ready for review.'}
              </p>
              <div className="flex gap-2.5 mt-3">
                <button
                  className="inline-flex items-center gap-2 rounded-btn px-3.5 py-2 text-[13px] font-semibold bg-gradient-accent text-white shadow-accent hover:-translate-y-px hover:shadow-accent-hover transition"
                  onClick={gotoNextStep}
                >
                  {meeting?.status === 'awaiting_speaker_confirmation'
                    ? 'Confirm speakers'
                    : meeting?.status === 'dispatched'
                      ? 'View dispatch'
                      : 'Review draft'}
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-btn px-3 py-2 text-[13px] font-semibold border transition"
                  style={{
                    background: 'transparent',
                    borderColor: 'oklch(1 0 0 / 0.15)',
                    color: 'oklch(0.85 0.02 270)',
                  }}
                  onClick={handleReset}
                >
                  Capture another
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p
            className="mt-4 mx-auto max-w-md text-center rounded-card px-3 py-2 text-[13px]"
            style={{
              background: 'oklch(0.30 0.10 18 / 0.6)',
              color: 'oklch(0.95 0.04 18)',
            }}
          >
            {error}
          </p>
        )}
      </div>
    </section>
  )
}
