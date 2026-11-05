import fs from 'node:fs'
import path from 'node:path'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { PredictionDocument } from '../../src/domain/types/import'
import { ExpectedValueAnalysis } from '../../src/features/bets/ExpectedValueAnalysis'

function samplePrediction() {
  return JSON.parse(
    fs.readFileSync(path.resolve('examples/prediction.sample.json'), 'utf8'),
  ) as PredictionDocument
}

describe('expected value analysis', () => {
  it('shows calculated, unavailable, and uncertainty labels without recommending purchase', () => {
    render(<ExpectedValueAnalysis prediction={samplePrediction()} />)

    expect(screen.getByRole('heading', { name: '期待値分析' })).toBeInTheDocument()
    expect(screen.getAllByText(/未算出/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/不確実性/).length).toBeGreaterThan(0)
    expect(screen.getByText(/利益や的中を保証せず/)).toBeInTheDocument()
    expect(screen.getByText(/各馬評価から確率を自動生成していません/)).toBeInTheDocument()
  })

  it('can switch between expected-return ranking and source order', () => {
    const prediction = samplePrediction()
    render(<ExpectedValueAnalysis prediction={prediction} />)
    const desktopTable = screen.getByRole('table')
    const rows = within(desktopTable).getAllByRole('row')

    expect(rows[1]).toHaveTextContent('馬連 2-7')

    fireEvent.change(screen.getByLabelText('並び順'), {
      target: { value: 'source_order' },
    })
    const sourceRows = within(desktopTable).getAllByRole('row')
    expect(sourceRows[1]).toHaveTextContent('単勝 2')
  })
})
