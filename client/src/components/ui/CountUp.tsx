import { useEffect, useRef, useState } from 'react'

type Props = {
  value: number
  duration?: number
  suffix?: string
}

export function CountUp({ value, duration = 700, suffix = '' }: Props) {
  const [n, setN] = useState(0)
  const startRef = useRef(0)
  useEffect(() => {
    let raf = 0
    const startVal = startRef.current
    const t0 = performance.now()
    const tick = () => {
      const e = Math.min(1, (performance.now() - t0) / duration)
      const eased = 1 - Math.pow(1 - e, 3)
      setN(Math.round(startVal + (value - startVal) * eased))
      if (e < 1) raf = requestAnimationFrame(tick)
      else startRef.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return (
    <span className="font-tabular">
      {n}
      {suffix}
    </span>
  )
}
