import fs from 'node:fs'
import path from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../src/app/App'
import { AuthProvider } from '../../src/features/auth/AuthProvider'

function renderImport() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/races/2026-11-08-TOKYO-11-JRA/import']}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe('prediction JSON import preview', () => {
  it('validates pasted JSON and renders the preview without saving', async () => {
    const sample = fs.readFileSync(
      path.resolve('examples/prediction.sample.json'),
      'utf8',
    )
    renderImport()

    fireEvent.change(await screen.findByLabelText(/JSONテキスト/, {}, { timeout: 10_000 }), {
      target: { value: sample },
    })
    fireEvent.click(screen.getByRole('button', { name: '検証してプレビュー' }))

    expect(screen.getByRole('heading', { name: '展開シナリオ' })).toBeInTheDocument()
    expect(screen.getByText('サンプルステークス')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下書きへ反映' })).toBeDisabled()
  }, 15_000)

  it('shows validation errors for an invalid document', async () => {
    renderImport()

    fireEvent.change(await screen.findByLabelText(/JSONテキスト/, {}, { timeout: 10_000 }), {
      target: { value: '{}' },
    })
    fireEvent.click(screen.getByRole('button', { name: '検証してプレビュー' }))

    expect(screen.getByRole('heading', { name: /検証エラー/ })).toBeInTheDocument()
  }, 15_000)
})
