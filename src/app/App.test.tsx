import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../features/auth/AuthProvider'
import { AppRoutes } from './App'

function renderRoute(route: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[route]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe('application routes', () => {
  it('renders the home dashboard with an explicit sample-data label', async () => {
    renderRoute('/')

    expect(
      await screen.findByRole('heading', { name: 'ホーム' }, { timeout: 10_000 }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('サンプルデータ').length).toBeGreaterThan(0)
    expect(
      screen.getByRole('navigation', { name: 'モバイルナビゲーション' }),
    ).toBeInTheDocument()
  })

  it.each([
    ['/races', 'レース'],
    ['/races/race-1/import', '予想JSONを取り込む'],
    ['/purchases', '購入'],
    ['/analytics', '分析'],
    ['/settings', '設定'],
  ])('renders %s route', async (route, heading) => {
    renderRoute(route)

    expect(
      await screen.findByRole('heading', { name: heading }, { timeout: 10_000 }),
    ).toBeInTheDocument()
  })

  it('redirects unknown paths to home', async () => {
    renderRoute('/not-found')

    expect(
      await screen.findByRole('heading', { name: 'ホーム' }, { timeout: 10_000 }),
    ).toBeInTheDocument()
  })
})
