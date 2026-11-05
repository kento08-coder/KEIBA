import fs from 'node:fs'
import path from 'node:path'
import { createResultInputTemplate } from '../../src/domain/result-template'
import type { ResultDocument } from '../../src/domain/types/import'
import { ResultDocumentSchema } from '../../src/domain/validation/result'

function sampleResult() {
  return JSON.parse(
    fs.readFileSync(path.resolve('examples/result.sample.json'), 'utf8'),
  ) as ResultDocument
}

describe('safe result input template', () => {
  it('cannot confirm the untouched input-waiting template', () => {
    const template = createResultInputTemplate('2026-11-08-TOKYO-11-JRA')
    expect(ResultDocumentSchema.safeParse(template).success).toBe(false)
    expect(template).toMatchObject({
      finishers: [],
      payouts: [],
      result_status: 'draft',
      source_agent: 'manual-entry-pending',
      sources: [],
    })
  })

  it('rejects a confirmed result that retains the pending marker', () => {
    const result = {
      ...sampleResult(),
      source_agent: 'manual-entry-pending',
    }
    expect(ResultDocumentSchema.safeParse(result).success).toBe(false)
  })

  it('rejects placeholder URLs and empty confirmed payout tables', () => {
    const placeholder = sampleResult()
    placeholder.sources[0]!.url = 'https://placeholder.invalid/official-result'
    const emptyPayout = { ...sampleResult(), payouts: [] }

    expect(ResultDocumentSchema.safeParse(placeholder).success).toBe(false)
    expect(ResultDocumentSchema.safeParse(emptyPayout).success).toBe(false)
  })
})
