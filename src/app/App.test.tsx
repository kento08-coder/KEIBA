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
  it('renders the home dashboard with an explicit sample-data label', () => {
    renderRoute('/')

    expect(screen.getByRole('heading', { name: 'ホーム' })).toBeInTheDocument()
    expect(screen.getAllByText('サンプルデータ').length).toBeGreaterThan(0)
    expect(
      screen.getByRole('navigation', { name: 'モバイルナビゲーション' }),
    ).toBeInTheDocument()
  })

  it.each([
    ['/races', 'レース'],
    ['/purchases', '購入'],
    ['/analytics', '分析'],
    ['/settings', '設定'],
  ])('renders %s route', (route, heading) => {
    renderRoute(route)

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
  })

  it('redirects unknown paths to home', () => {
    renderRoute('/not-found')

    expect(screen.getByRole('heading', { name: 'ホーム' })).toBeInTheDocument()
  })
})
