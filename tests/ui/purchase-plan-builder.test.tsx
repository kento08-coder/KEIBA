import fs from 'node:fs'
import path from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import type { PredictionDocument } from '../../src/domain/types/import'
import { PurchasePlanBuilder } from '../../src/features/bets/PurchasePlanBuilder'

function samplePrediction() {
  return JSON.parse(
    fs.readFileSync(path.resolve('examples/prediction.sample.json'), 'utf8'),
  ) as PredictionDocument
}

describe('purchase plan builder', () => {
  it('shows three plans, scenario context, and non-guarantee notices', async () => {
    render(
      <PurchasePlanBuilder
        onSave={vi.fn()}
        prediction={samplePrediction()}
        raceName="架空サンプルステークス"
        sourcePredictionVersionId="version-1"
        userId="owner-a"
        versionNumber={1}
      />,
    )

    expect(screen.getByText('推定期待利益重視')).toBeInTheDocument()
    expect(screen.getByText('保守的ケリー参考')).toBeInTheDocument()
    expect(screen.getByText('損失抑制')).toBeInTheDocument()
    expect(screen.getByText(/実際の購入操作も行いません/)).toBeInTheDocument()
    expect(screen.getByText(/条件付き的中確率がありません/)).toBeInTheDocument()
    expect(screen.getByText(/元予想: v1/)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getAllByLabelText(/の購入金額/).length).toBeGreaterThan(0),
    )
  })

  it('recalculates manual edits and blocks a non-100-yen amount', async () => {
    render(
      <PurchasePlanBuilder
        onSave={vi.fn()}
        prediction={samplePrediction()}
        raceName="架空サンプルステークス"
        sourcePredictionVersionId="version-1"
        userId="owner-a"
        versionNumber={1}
      />,
    )
    const stakeInputs = await screen.findAllByLabelText(/の購入金額/)
    fireEvent.change(stakeInputs[0]!, { target: { value: '150' } })

    expect(await screen.findByText(/100円単位で指定してください/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /新しいプランとして保存/ }),
    ).toBeDisabled()
  })

  it('saves a version-linked immutable snapshot', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <PurchasePlanBuilder
        onSave={onSave}
        prediction={samplePrediction()}
        raceName="架空サンプルステークス"
        sourcePredictionVersionId="version-1"
        userId="owner-a"
        versionNumber={1}
      />,
    )
    await waitFor(() =>
      expect(screen.getAllByLabelText(/の購入金額/).length).toBeGreaterThan(0),
    )
    fireEvent.change(screen.getByLabelText('プラン名'), {
      target: { value: '手動調整プラン' },
    })
    fireEvent.change(screen.getByLabelText('メモ'), {
      target: { value: '保存テスト' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: /新しいプランとして保存/ }),
    )

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      algorithmVersion: 'phase1-m4-v1',
      authorUid: 'owner-a',
      isSimulation: true,
      memo: '保存テスト',
      name: '手動調整プラン',
      sourcePredictionVersionId: 'version-1',
    })
    expect(
      await screen.findByText(/不変スナップショットとして保存しました/),
    ).toBeInTheDocument()
  })

  it('uses a new plan id when a saved snapshot is edited and saved again', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <PurchasePlanBuilder
        onSave={onSave}
        prediction={samplePrediction()}
        raceName="架空サンプルステークス"
        sourcePredictionVersionId="version-1"
        userId="owner-a"
        versionNumber={1}
      />,
    )
    await waitFor(() =>
      expect(screen.getAllByLabelText(/の購入金額/).length).toBeGreaterThan(0),
    )
    const saveButton = screen.getByRole('button', {
      name: /新しいプランとして保存/,
    })
    fireEvent.click(saveButton)
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('メモ'), {
      target: { value: '再調整' },
    })
    fireEvent.click(saveButton)
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))

    expect(onSave.mock.calls[1]?.[0].planId).not.toBe(
      onSave.mock.calls[0]?.[0].planId,
    )
  })
})
