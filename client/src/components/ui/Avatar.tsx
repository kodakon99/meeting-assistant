import { hueFromString, initialFromName } from './hue'

export type AvatarPerson = {
  id: string
  name: string
  hue?: number
}

type AvatarProps = {
  person: AvatarPerson | null | undefined
  size?: number
  ring?: boolean
}

export function Avatar({ person, size = 28, ring = false }: AvatarProps) {
  if (!person) return null
  const hue = person.hue ?? hueFromString(person.name)
  const bg = `oklch(0.78 0.13 ${hue})`
  const fg = `oklch(0.28 0.06 ${hue})`
  return (
    <span
      className="inline-flex items-center justify-center rounded-pill font-semibold flex-shrink-0 select-none"
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        fontSize: Math.round(size * 0.42),
        boxShadow: ring
          ? `0 0 0 2px oklch(0.99 0.005 80), 0 0 0 4px ${bg}`
          : undefined,
      }}
      title={person.name}
    >
      {initialFromName(person.name)}
    </span>
  )
}

type AvatarStackProps = {
  people: AvatarPerson[]
  size?: number
  max?: number
}

export function AvatarStack({ people, size = 24, max = 4 }: AvatarStackProps) {
  const visible = people.slice(0, max)
  const rest = people.length - visible.length
  const overlap = -size * 0.35
  return (
    <div className="inline-flex items-center">
      {visible.map((p, i) => (
        <span
          key={p.id}
          style={{ marginLeft: i === 0 ? 0 : overlap, zIndex: 10 - i }}
        >
          <Avatar person={p} size={size} ring />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-pill font-semibold flex-shrink-0 select-none"
          style={{
            width: size,
            height: size,
            marginLeft: overlap,
            background: 'oklch(0.95 0.005 80)',
            color: 'oklch(0.45 0.02 80)',
            fontSize: Math.round(size * 0.38),
            boxShadow: '0 0 0 2px oklch(0.99 0.005 80)',
          }}
        >
          +{rest}
        </span>
      )}
    </div>
  )
}
