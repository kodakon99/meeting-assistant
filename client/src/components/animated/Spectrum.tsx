import { useEffect, useRef, useState } from 'react'

const BINS = 56

export function useSimulatedSpectrum(active: boolean): number[] {
  const [vals, setVals] = useState<number[]>(() => Array(BINS).fill(0))
  const tRef = useRef(0)
  useEffect(() => {
    if (!active) {
      let raf = 0
      const settle = () => {
        setVals((prev) => {
          const next = prev.map((v) => v * 0.85)
          if (next.some((v) => v > 0.01))
            raf = requestAnimationFrame(settle)
          return next
        })
      }
      raf = requestAnimationFrame(settle)
      return () => cancelAnimationFrame(raf)
    }
    let raf = 0
    const tick = () => {
      tRef.current += 0.05
      const t = tRef.current
      const next = Array(BINS)
        .fill(0)
        .map((_, i) => {
          const x = i / BINS
          const env = 0.6 + 0.4 * Math.sin(t * 0.7 + x * 1.3)
          const v =
            (Math.sin(t * 2.1 + x * 5.0) * 0.5 + 0.5) * 0.6 +
            (Math.sin(t * 3.6 + x * 11.0) * 0.5 + 0.5) * 0.3 +
            (Math.sin(t * 0.9 + x * 2.0) * 0.5 + 0.5) * 0.2
          const voiceWeight = Math.exp(-Math.pow((x - 0.3) / 0.35, 2))
          return Math.max(0, Math.min(1, v * env * (0.4 + voiceWeight)))
        })
      setVals(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])
  return vals
}

export function useAnalyserSpectrum(
  stream: MediaStream | null,
): number[] {
  const [vals, setVals] = useState<number[]>(() => Array(BINS).fill(0))
  useEffect(() => {
    if (!stream) {
      setVals(Array(BINS).fill(0))
      return
    }
    let raf = 0
    let ctx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let buf: Uint8Array | null = null
    try {
      const AudioCtx =
        (window as unknown as { AudioContext?: typeof AudioContext })
          .AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!AudioCtx) return
      ctx = new AudioCtx()
      const source = ctx.createMediaStreamSource(stream)
      analyser = ctx.createAnalyser()
      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0.75
      source.connect(analyser)
      buf = new Uint8Array(analyser.frequencyBinCount)
    } catch {
      return
    }
    const tick = () => {
      if (!analyser || !buf) return
      analyser.getByteFrequencyData(buf as unknown as Uint8Array<ArrayBuffer>)
      const out: number[] = []
      const step = buf.length / BINS
      for (let i = 0; i < BINS; i++) {
        const start = Math.floor(i * step)
        const end = Math.floor((i + 1) * step)
        let sum = 0
        for (let j = start; j < end; j++) sum += buf[j]
        out.push(sum / Math.max(1, end - start) / 255)
      }
      setVals(out)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      try {
        ctx?.close()
      } catch {
        // ignore
      }
    }
  }, [stream])
  return vals
}

export function Spectrum({
  values,
  color = 'oklch(0.70 0.18 280)',
}: {
  values: number[]
  color?: string
}) {
  return (
    <div
      className="flex items-center justify-center gap-[3px] h-[86px] px-2"
      aria-hidden
    >
      {values.map((v, i) => (
        <span
          key={i}
          className="w-1 rounded-[2px] transition-[height,opacity] duration-[80ms] linear"
          style={{
            height: `${10 + v * 90}%`,
            background: color,
            opacity: 0.5 + v * 0.5,
          }}
        />
      ))}
    </div>
  )
}
