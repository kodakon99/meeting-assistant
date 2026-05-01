import { useEffect, useState } from 'react'

export type Snippet = { t: string; who: string; text: string }

const DEFAULT_SNIPPETS: Snippet[] = [
  { t: '0:04', who: 'Speaker 1', text: 'Okay quick sprint sync. Let me start.' },
  {
    t: '0:09',
    who: 'Speaker 1',
    text: "I'm still working on the onboarding checklist content.",
  },
  {
    t: '0:18',
    who: 'Speaker 2',
    text: 'Once that ships I can build the checklist UI component.',
  },
  {
    t: '0:31',
    who: 'Speaker 2',
    text: "I'm also building the account setup flow, in progress.",
  },
]

export function LiveTranscript({
  active,
  snippets = DEFAULT_SNIPPETS,
}: {
  active: boolean
  snippets?: Snippet[]
}) {
  const [index, setIndex] = useState(0)
  const [chars, setChars] = useState(0)

  useEffect(() => {
    if (!active) return
    const cur = snippets[index]
    if (!cur) return
    if (chars < cur.text.length) {
      const id = setTimeout(
        () => setChars((c) => c + 1),
        22 + Math.random() * 30,
      )
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => {
      setIndex((i) => (i + 1) % snippets.length)
      setChars(0)
    }, 1200)
    return () => clearTimeout(id)
  }, [chars, index, active, snippets])

  const items: Array<Snippet & { isCurrent: boolean; key: string }> = []
  for (let k = -2; k <= 0; k++) {
    const idx = (index + k + snippets.length) % snippets.length
    const line = snippets[idx]
    if (!line) continue
    const isCurrent = k === 0
    const text = isCurrent ? line.text.slice(0, chars) : line.text
    items.push({
      ...line,
      text,
      isCurrent,
      key: `${idx}-${k}-${index}`,
    })
  }

  return (
    <div
      className="mt-1 px-4 py-3.5 rounded-card border flex flex-col gap-2.5 min-h-[110px]"
      style={{
        background: 'oklch(1 0 0 / 0.04)',
        borderColor: 'oklch(1 0 0 / 0.06)',
      }}
    >
      {items.map((it, i) => (
        <div
          key={it.key}
          className="flex gap-3 items-baseline transition-opacity duration-300"
          style={{
            opacity:
              i === items.length - 1
                ? 1
                : 0.45 - (items.length - 1 - i) * 0.15,
          }}
        >
          <span className="inline-flex gap-2 min-w-[130px] flex-shrink-0">
            <span
              className="font-mono text-[11px]"
              style={{ color: 'oklch(0.65 0.02 270)' }}
            >
              {it.t}
            </span>
            <span
              className="font-semibold text-[12px]"
              style={{ color: 'oklch(0.85 0.06 280)' }}
            >
              {it.who}
            </span>
          </span>
          <span
            className="text-[13.5px] leading-snug"
            style={{ color: 'oklch(0.94 0.01 270)' }}
          >
            {it.text}
            {it.isCurrent && (
              <span
                className="inline-block w-0.5 align-middle ml-0.5 animate-ma-caret"
                style={{
                  height: '1em',
                  background: 'oklch(0.85 0.06 280)',
                }}
              />
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
