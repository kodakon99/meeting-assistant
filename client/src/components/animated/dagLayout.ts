import type { Task } from '../../lib/types'

export type LaidOutNode = {
  task: Task
  x: number // 0..1
  y: number // 0..1
}

export function layoutDag(tasks: Task[]): LaidOutNode[] {
  if (tasks.length === 0) return []
  const byId = new Map(tasks.map((t) => [t.id, t]))

  // Longest-path rank per node, with cycle protection.
  const rank = new Map<string, number>()
  const visiting = new Set<string>()

  function depth(id: string): number {
    if (rank.has(id)) return rank.get(id)!
    if (visiting.has(id)) return 0
    visiting.add(id)
    const t = byId.get(id)
    if (!t) {
      visiting.delete(id)
      return 0
    }
    let d = 0
    for (const up of t.dependsOn) {
      if (byId.has(up)) d = Math.max(d, depth(up) + 1)
    }
    visiting.delete(id)
    rank.set(id, d)
    return d
  }

  for (const t of tasks) depth(t.id)

  const maxRank = Math.max(...rank.values(), 0)

  // Group by rank.
  const byRank: Task[][] = Array.from({ length: maxRank + 1 }, () => [])
  for (const t of tasks) byRank[rank.get(t.id) ?? 0].push(t)

  // Within each rank, sort by description for stability.
  for (const list of byRank) {
    list.sort((a, b) => a.description.localeCompare(b.description))
  }

  const out: LaidOutNode[] = []
  const xDenom = Math.max(1, maxRank)
  for (let r = 0; r <= maxRank; r++) {
    const list = byRank[r]
    const n = list.length
    for (let i = 0; i < n; i++) {
      const x = maxRank === 0 ? 0.5 : r / xDenom
      const y = n === 1 ? 0.5 : i / (n - 1)
      out.push({ task: list[i], x, y })
    }
  }
  return out
}
