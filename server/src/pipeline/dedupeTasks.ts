import type { ExistingTaskInput } from './extract.js'

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'for',
  'on',
  'of',
  'in',
  'and',
  'or',
  'with',
  'is',
  'be',
  'this',
  'that',
  'it',
  'as',
  'at',
  'by',
])

function tokenize(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersect = 0
  for (const x of a) if (b.has(x)) intersect++
  const union = a.size + b.size - intersect
  return intersect / union
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const m = a.length
  const n = b.length
  const prev: number[] = new Array(n + 1)
  const cur: number[] = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    cur[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j]
  }
  return prev[n]
}

function ownerMatches(
  newOwner: string | null,
  existingOwner: string,
): boolean {
  if (!newOwner) return false
  const a = newOwner.trim().toLowerCase()
  const b = existingOwner.trim().toLowerCase()
  if (!a || !b) return false
  if (a === b) return true
  // tolerate "Sarah" vs "Sarah Chen" — substring or first-word match
  const aFirst = a.split(/\s+/)[0]
  const bFirst = b.split(/\s+/)[0]
  if (aFirst === bFirst && aFirst.length >= 3) return true
  // tolerate small typos
  const shorter = a.length < b.length ? a : b
  if (shorter.length >= 4 && levenshtein(a, b) <= 2) return true
  return false
}

const DESCRIPTION_THRESHOLD = 0.55

export function findDuplicateExisting(
  ownerDisplayName: string | null,
  description: string,
  existing: ExistingTaskInput[],
): ExistingTaskInput | null {
  if (!description.trim()) return null
  const newTokens = tokenize(description)
  if (newTokens.size === 0) return null

  let best: { task: ExistingTaskInput; score: number } | null = null
  for (const t of existing) {
    if (!ownerMatches(ownerDisplayName, t.ownerDisplayName)) continue
    const score = jaccard(newTokens, tokenize(t.description))
    if (score < DESCRIPTION_THRESHOLD) continue
    if (!best || score > best.score) best = { task: t, score }
  }
  return best?.task ?? null
}
