import type { PredictionDocument } from './types/import'

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortObject(entry)]),
    )
  }
  return value
}
export function stableStringify(value: unknown) {
  return JSON.stringify(sortObject(value))
}

export function predictionContentForComparison(
  document: PredictionDocument,
) {
  return Object.fromEntries(
    Object.entries(document).filter(
      ([key]) => key !== 'generated_at' && key !== 'change_reason',
    ),
  )
}

export function hasSamePredictionContent(
  left: PredictionDocument,
  right: PredictionDocument,
) {
  return (
    stableStringify(predictionContentForComparison(left)) ===
    stableStringify(predictionContentForComparison(right))
  )
}

export async function hashPredictionDocument(document: PredictionDocument) {
  return hashDocument(document)
}

export async function hashDocument(document: unknown) {
  const bytes = new TextEncoder().encode(stableStringify(document))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export interface PredictionDifference {
  after: unknown
  before: unknown
  path: string
}

function collectDifferences(
  before: unknown,
  after: unknown,
  path: string,
  differences: PredictionDifference[],
) {
  if (Object.is(before, after)) {
    return
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length)
    for (let index = 0; index < length; index += 1) {
      collectDifferences(
        before[index],
        after[index],
        `${path}[${index}]`,
        differences,
      )
    }
    return
  }

  if (
    before &&
    after &&
    typeof before === 'object' &&
    typeof after === 'object'
  ) {
    const keys = new Set([
      ...Object.keys(before as Record<string, unknown>),
      ...Object.keys(after as Record<string, unknown>),
    ])
    for (const key of [...keys].sort()) {
      collectDifferences(
        (before as Record<string, unknown>)[key],
        (after as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
        differences,
      )
    }
    return
  }

  differences.push({ path, before, after })
}

export function diffPredictionDocuments(
  before: PredictionDocument | null,
  after: PredictionDocument,
) {
  const differences: PredictionDifference[] = []
  collectDifferences(before, after, '', differences)
  return differences
}
