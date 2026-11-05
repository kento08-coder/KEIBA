import fs from 'node:fs'
import path from 'node:path'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { PredictionDocument } from '../../src/domain/types/import'
import { PredictionEditorPage } from '../../src/pages/PredictionEditorPage'

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
  finalizePrediction: vi.fn(),
  savePredictionDraft: vi.fn(),
}))

vi.mock('../../src/features/auth/useAuth', () => ({
  useAuth: () => ({ status: 'signed-in', user: { uid: 'owner-a' } }),
}))

vi.mock('../../src/features/races/use-race-data', () => ({
  usePredictionDraft: () => mocks.draft,
}))

vi.mock('../../src/infrastructure/repositories/race-repository', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/infrastructure/repositories/race-repository')
  >('../../src/infrastructure/repositories/race-repository')
  return {
    ...actual,
    finalizePrediction: mocks.finalizePrediction,
    savePredictionDraft: mocks.savePredictionDraft,
  }
})

function samplePrediction() {
  return JSON.parse(
    fs.readFileSync(path.resolve('examples/prediction.sample.json'), 'utf8'),
  ) as PredictionDocument
}

function page() {
  return (
    <MemoryRouter initialEntries={['/races/2026-11-08-TOKYO-11-JRA/editor']}>
      <Routes>
        <Route element={<PredictionEditorPage />} path="/races/:id/editor" />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  mocks.savePredictionDraft.mockReset()
  mocks.finalizePrediction.mockReset()
  mocks.draft.value = {
    baseVersionId: null,
    lastEditedAt: null,
    lastEditedByClient: 'initial-client',
    payload: samplePrediction(),
    revision: 1,
    schemaVersion: '1.0.0',
  }
})

afterEach(() => {
  vi.useRealTimers()
})

async function firstScenarioLabel() {
  return (await screen.findAllByLabelText('表示名'))[0] as HTMLInputElement
}

describe('prediction editor autosave', () => {
  it('saves the newest edit after another edit occurs while a save is in progress', async () => {
    let finishFirstSave: ((revision: number) => void) | undefined
    mocks.savePredictionDraft
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            finishFirstSave = resolve
          }),
      )
      .mockResolvedValueOnce(3)
    render(page())
    const label = await firstScenarioLabel()
    vi.useFakeTimers()

    fireEvent.change(label, { target: { value: '編集中1' } })
    await act(async () => {
      vi.advanceTimersByTime(1_200)
      await Promise.resolve()
    })
    expect(mocks.savePredictionDraft).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/保存中/)).toBeInTheDocument()

    fireEvent.change(label, { target: { value: '編集中2' } })
    await act(async () => {
      finishFirstSave?.(2)
      await Promise.resolve()
    })
    expect(screen.getByText(/未保存の変更/)).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(1_200)
      await Promise.resolve()
    })
    expect(mocks.savePredictionDraft).toHaveBeenCalledTimes(2)
    const secondSave = mocks.savePredictionDraft.mock.calls[1]?.[0]
    expect(secondSave?.expectedRevision).toBe(2)
    expect(secondSave?.payload.scenarios[0]?.label).toBe('編集中2')
  })

  it('stops autosave on conflict and can edit again after loading the cloud draft', async () => {
    mocks.savePredictionDraft.mockResolvedValue(3)
    const view = render(page())
    const label = await firstScenarioLabel()
    vi.useFakeTimers()

    fireEvent.change(label, { target: { value: 'ローカル変更' } })
    const cloud = samplePrediction()
    cloud.scenarios[0]!.label = 'クラウド変更'
    mocks.draft.value = {
      ...mocks.draft.value!,
      lastEditedByClient: 'remote-client',
      payload: cloud,
      revision: 2,
    }
    view.rerender(page())

    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText(/競合を検出/)).toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })
    expect(mocks.savePredictionDraft).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'クラウド版を読み込む' }))
    const reloaded = screen.getAllByLabelText('表示名')[0] as HTMLInputElement
    expect(reloaded).toHaveValue('クラウド変更')
    fireEvent.change(reloaded, { target: { value: '競合解消後の変更' } })
    await act(async () => {
      vi.advanceTimersByTime(1_200)
      await Promise.resolve()
    })
    expect(mocks.savePredictionDraft).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: 2 }),
    )
  })

  it('keeps unsaved input and does not retry endlessly after a communication error', async () => {
    mocks.savePredictionDraft.mockRejectedValue(new Error('network unavailable'))
    render(page())
    const label = await firstScenarioLabel()
    vi.useFakeTimers()

    fireEvent.change(label, { target: { value: '失われない変更' } })
    await act(async () => {
      vi.advanceTimersByTime(1_200)
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText(/保存失敗/)).toBeInTheDocument()
    expect(label).toHaveValue('失われない変更')

    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    expect(mocks.savePredictionDraft).toHaveBeenCalledTimes(1)
    expect(label).toHaveValue('失われない変更')
  })
})
