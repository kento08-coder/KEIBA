import fs from 'node:fs'
import path from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { PredictionDocument } from '../../src/domain/types/import'
import { PredictionImportPage } from '../../src/pages/PredictionImportPage'

const mocks = vi.hoisted(() => ({
  draft: {
    error: null as string | null,
    state: 'ready' as const,
    value: null as null | {
      baseVersionId: string | null
      lastEditedAt: null
      lastEditedByClient: string
      payload: PredictionDocument
      revision: number
      schemaVersion: '1.0.0'
    },
  },
  importPredictionDraft: vi.fn(),
}))

vi.mock('../../src/features/auth/useAuth', () => ({
  useAuth: () => ({ status: 'signed-in', user: { uid: 'owner-a' } }),
}))

vi.mock('../../src/features/races/use-race-data', () => ({
  usePredictionDraft: () => mocks.draft,
  useRace: () => ({ error: null, state: 'ready', value: null }),
}))

vi.mock('../../src/infrastructure/repositories/race-repository', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/infrastructure/repositories/race-repository')
  >('../../src/infrastructure/repositories/race-repository')
  return { ...actual, importPredictionDraft: mocks.importPredictionDraft }
})

function samplePrediction() {
  return JSON.parse(
    fs.readFileSync(path.resolve('examples/prediction.sample.json'), 'utf8'),
  ) as PredictionDocument
}

function page() {
  return (
    <MemoryRouter initialEntries={['/races/2026-11-08-TOKYO-11-JRA/import']}>
      <Routes>
        <Route element={<PredictionImportPage />} path="/races/:id/import" />
        <Route element={<p>editor</p>} path="/races/:id/editor" />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  mocks.importPredictionDraft.mockReset()
  mocks.importPredictionDraft.mockResolvedValue({
    contentHash: 'hash',
    importId: 'import-id',
    revision: 6,
  })
  const current = samplePrediction()
  current.scenarios[0]!.label = '現在の下書きラベル'
  mocks.draft.value = {
    baseVersionId: 'version-1',
    lastEditedAt: null,
    lastEditedByClient: 'another-client',
    payload: current,
    revision: 5,
    schemaVersion: '1.0.0',
  }
})

describe('prediction import draft replacement', () => {
  it('shows differences and allows the replacement to be cancelled', () => {
    const incoming = samplePrediction()
    render(page())

    fireEvent.change(screen.getByLabelText(/JSONテキスト/), {
      target: { value: JSON.stringify(incoming) },
    })
    fireEvent.click(screen.getByRole('button', { name: '検証してプレビュー' }))
    fireEvent.click(screen.getByRole('button', { name: '下書き置換を確認' }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent('現在の下書きが存在します')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('scenarios[0].label')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('確定済みの予想バージョンは変更されません')

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(mocks.importPredictionDraft).not.toHaveBeenCalled()
  })

  it('uses the preview revision so a later remote update cannot be overwritten', async () => {
    const incoming = samplePrediction()
    const view = render(page())

    fireEvent.change(screen.getByLabelText(/JSONテキスト/), {
      target: { value: JSON.stringify(incoming) },
    })
    fireEvent.click(screen.getByRole('button', { name: '検証してプレビュー' }))
    fireEvent.click(screen.getByRole('button', { name: '下書き置換を確認' }))

    mocks.draft.value = {
      ...mocks.draft.value!,
      revision: 6,
      lastEditedByClient: 'remote-client',
    }
    view.rerender(page())
    fireEvent.click(screen.getByRole('button', { name: '下書きを置き換える' }))

    await waitFor(() => {
      expect(mocks.importPredictionDraft).toHaveBeenCalledWith(
        expect.objectContaining({ expectedRevision: 5 }),
      )
    })
  })
})
