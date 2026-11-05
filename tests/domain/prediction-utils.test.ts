import fs from 'node:fs'
import path from 'node:path'
import {
  diffPredictionDocuments,
  stableStringify,
} from '../../src/domain/prediction-utils'
import type { PredictionDocument } from '../../src/domain/types/import'

function samplePrediction() {
  return JSON.parse(
    fs.readFileSync(path.resolve('examples/prediction.sample.json'), 'utf8'),
  ) as PredictionDocument
}

describe('stableStringify', () => {
  it('produces the same output regardless of object key order', () => {
    expect(stableStringify({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableStringify({ a: { c: 3, d: 4 }, b: 2 }),
    )
  })

  it('preserves array order', () => {
    expect(stableStringify({ values: [2, 1] })).not.toBe(
      stableStringify({ values: [1, 2] }),
    )
  })
})
describe('prediction version differences', () => {
  it('reports changed fields with old and new values', () => {
    const before = samplePrediction()
    const after = structuredClone(before)
    after.scenarios[0]!.probability = 0.2
    after.scenarios[1]!.probability = 0.55
    after.horses[0]!.probabilities.win = null

    const differences = diffPredictionDocuments(before, after)

    expect(differences).toEqual(
      expect.arrayContaining([
        {
          path: 'scenarios[0].probability',
          before: 0.25,
          after: 0.2,
        },
        {
          path: 'horses[0].probabilities.win',
          before: 0.14,
          after: null,
        },
      ]),
    )
  })

  it('returns no differences for identical snapshots', () => {
    const prediction = samplePrediction()
    expect(diffPredictionDocuments(prediction, structuredClone(prediction))).toEqual([])
  })
})
