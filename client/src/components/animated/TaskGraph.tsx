import { useEffect, useMemo, useRef, useState } from 'react'
import type { Task } from '../../lib/types'
import { hueFromString, initialFromName } from '../ui/hue'
import { layoutDag } from './dagLayout'

type Props = {
  tasks: Task[]
  focusId?: string | null
  onFocus?: (id: string | null) => void
}

const NODE = 32
const PAD_X = 80
const PAD_Y = 40

export function TaskGraph({ tasks, focusId = null, onFocus }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 460 })
  const [hover, setHover] = useState<string | null>(null)
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const r = e.contentRect
        setSize({
          w: Math.max(400, r.width),
          h: Math.max(360, r.height),
        })
      }
    })
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const id = setTimeout(() => setDrawn(true), 80)
    return () => clearTimeout(id)
  }, [])

  const laidOut = useMemo(() => layoutDag(tasks), [tasks])
  const nodeById = useMemo(
    () => new Map(laidOut.map((n) => [n.task.id, n])),
    [laidOut],
  )
  const tasksById = useMemo(
    () => new Map(tasks.map((t) => [t.id, t])),
    [tasks],
  )

  const pos = (id: string) => {
    const n = nodeById.get(id)
    if (!n) return { x: 0, y: 0 }
    return {
      x: PAD_X + n.x * (size.w - PAD_X * 2),
      y: PAD_Y + n.y * (size.h - PAD_Y * 2),
    }
  }

  const edges = useMemo(() => {
    const out: { id: string; from: string; to: string }[] = []
    for (const t of tasks) {
      for (const dep of t.dependsOn) {
        if (!tasksById.has(dep)) continue
        out.push({ id: `${dep}->${t.id}`, from: dep, to: t.id })
      }
    }
    return out
  }, [tasks, tasksById])

  const activeId = hover ?? focusId

  const highlight = useMemo(() => {
    if (!activeId) return { nodes: new Set<string>(), edges: new Set<string>() }
    const nodes = new Set<string>([activeId])
    const edgeSet = new Set<string>()
    const up = (id: string) => {
      const t = tasksById.get(id)
      if (!t) return
      for (const d of t.dependsOn) {
        nodes.add(d)
        edgeSet.add(`${d}->${id}`)
        up(d)
      }
    }
    const down = (id: string) => {
      for (const t of tasks) {
        if (t.dependsOn.includes(id)) {
          nodes.add(t.id)
          edgeSet.add(`${id}->${t.id}`)
          down(t.id)
        }
      }
    }
    up(activeId)
    down(activeId)
    return { nodes, edges: edgeSet }
  }, [activeId, tasks, tasksById])

  if (tasks.length === 0) {
    return (
      <div
        ref={wrapRef}
        className="bg-surface border border-line rounded-card h-[460px] flex items-center justify-center text-ink-3 text-[13px]"
      >
        No tasks yet — capture a meeting to see the dependency graph.
      </div>
    )
  }

  return (
    <div
      ref={wrapRef}
      className="bg-surface border border-line rounded-card h-[460px] overflow-hidden relative"
    >
      <svg
        width="100%"
        height={size.h}
        viewBox={`0 0 ${size.w} ${size.h}`}
        className="block"
      >
        <defs>
          <marker
            id="ma-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="oklch(0.62 0.18 280 / 0.65)" />
          </marker>
          <marker
            id="ma-arrow-dim"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="oklch(0.78 0.01 80 / 0.6)" />
          </marker>
          <pattern
            id="ma-graph-dots"
            x="0"
            y="0"
            width="22"
            height="22"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="0.8" fill="oklch(0.86 0.01 80)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ma-graph-dots)" opacity="0.55" />

        {/* edges */}
        {edges.map((e, i) => {
          const a = pos(e.from)
          const b = pos(e.to)
          const cx = (a.x + b.x) / 2
          const d = `M ${a.x} ${a.y} C ${cx} ${a.y}, ${cx} ${b.y}, ${b.x} ${b.y}`
          const isHL = activeId !== null && highlight.edges.has(e.id)
          const dim = activeId !== null && !isHL
          return (
            <path
              key={e.id}
              d={d}
              fill="none"
              strokeLinecap="round"
              stroke={
                dim
                  ? 'oklch(0.85 0.01 80)'
                  : isHL
                    ? 'oklch(0.62 0.18 280)'
                    : 'oklch(0.62 0.18 280 / 0.55)'
              }
              strokeWidth={isHL ? 2.2 : 1.4}
              style={{
                strokeDasharray: 1000,
                strokeDashoffset: drawn ? 0 : 1000,
                transition: `stroke-dashoffset 1s ease-out ${100 + i * 60}ms, stroke .25s, stroke-width .25s`,
                filter: isHL ? 'drop-shadow(0 0 6px oklch(0.62 0.18 280 / 0.5))' : undefined,
              }}
              markerEnd={dim ? 'url(#ma-arrow-dim)' : 'url(#ma-arrow)'}
            />
          )
        })}

        {/* nodes */}
        {laidOut.map((n, i) => {
          const t = n.task
          const p = pos(t.id)
          const hue = hueFromString(t.ownerDisplayName)
          const isHL = activeId !== null && highlight.nodes.has(t.id)
          const dim = activeId !== null && !isHL
          return (
            <g
              key={t.id}
              transform={`translate(${p.x - NODE / 2}, ${p.y - NODE / 2})`}
              className="cursor-pointer"
              style={{
                opacity: dim ? 0.35 : 1,
                transformBox: 'fill-box',
                transformOrigin: 'center',
                animation: `ma-node-in 0.5s cubic-bezier(0.34,1.56,0.64,1) ${i * 70}ms forwards`,
                filter: isHL
                  ? 'drop-shadow(0 4px 8px oklch(0.62 0.18 280 / 0.35))'
                  : undefined,
                transition: 'opacity .25s, transform .25s',
              }}
              onMouseEnter={() => setHover(t.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onFocus?.(t.id === focusId ? null : t.id)}
            >
              <rect
                width={NODE}
                height={NODE}
                rx={NODE / 2}
                fill={`oklch(0.78 0.13 ${hue})`}
                stroke="oklch(0.99 0.005 80)"
                strokeWidth="2.5"
              />
              <text
                x={NODE / 2}
                y={NODE / 2 + 4}
                textAnchor="middle"
                fontSize="13"
                fontWeight="600"
                fill={`oklch(0.28 0.06 ${hue})`}
              >
                {initialFromName(t.ownerDisplayName)}
              </text>
              {t.status === 'done' && (
                <g transform={`translate(${NODE - 9}, -3)`}>
                  <circle
                    r="7"
                    fill="oklch(0.62 0.14 152)"
                    stroke="oklch(0.99 0.005 80)"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M -3 0 L -1 2 L 3 -2"
                    fill="none"
                    stroke="oklch(0.99 0.005 80)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              )}
              {t.status === 'in_progress' && (
                <circle
                  cx={NODE - 5}
                  cy={4}
                  r={5}
                  fill="oklch(0.78 0.13 70)"
                  stroke="oklch(0.99 0.005 80)"
                  strokeWidth="1.5"
                >
                  <animate
                    attributeName="opacity"
                    values="1;0.4;1"
                    dur="1.6s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
            </g>
          )
        })}

        {/* hover label */}
        {hover &&
          (() => {
            const t = tasksById.get(hover)
            if (!t) return null
            const p = pos(t.id)
            const labelW = Math.min(
              280,
              Math.max(180, t.description.length * 7 + 40),
            )
            const lx = Math.min(
              size.w - labelW - 8,
              Math.max(8, p.x - labelW / 2),
            )
            const ly = p.y - 64
            return (
              <g transform={`translate(${lx}, ${ly})`} style={{ pointerEvents: 'none' }}>
                <rect
                  width={labelW}
                  height={48}
                  rx="10"
                  fill="oklch(0.20 0.02 80)"
                  opacity="0.96"
                />
                <text
                  x="14"
                  y="20"
                  fontSize="12"
                  fontWeight="600"
                  fill="oklch(0.97 0.005 80)"
                >
                  {t.description.length > 38
                    ? t.description.slice(0, 36) + '…'
                    : t.description}
                </text>
                <text
                  x="14"
                  y="36"
                  fontSize="11"
                  fill="oklch(0.78 0.01 80)"
                >
                  {t.ownerDisplayName}
                  {t.deadline ? ` · due ${t.deadline}` : ''} ·{' '}
                  {t.status.replace('_', ' ')}
                </text>
              </g>
            )
          })()}
      </svg>
    </div>
  )
}
