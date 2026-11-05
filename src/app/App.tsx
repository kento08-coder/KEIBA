import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../features/auth/AuthProvider'
import { AppShell } from './AppShell'

const AnalyticsPage = lazy(() =>
  import('../pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })),
)
const HomePage = lazy(() =>
  import('../pages/HomePage').then((module) => ({ default: module.HomePage })),
)
const PurchasesPage = lazy(() =>
  import('../pages/PurchasesPage').then((module) => ({ default: module.PurchasesPage })),
)
const PredictionEditorPage = lazy(() =>
  import('../pages/PredictionEditorPage').then((module) => ({ default: module.PredictionEditorPage })),
)
const PredictionImportPage = lazy(() =>
  import('../pages/PredictionImportPage').then((module) => ({ default: module.PredictionImportPage })),
)
const PredictionVersionPage = lazy(() =>
  import('../pages/PredictionVersionPage').then((module) => ({ default: module.PredictionVersionPage })),
)
const RaceDetailPage = lazy(() =>
  import('../pages/RaceDetailPage').then((module) => ({ default: module.RaceDetailPage })),
)
const RacesPage = lazy(() =>
  import('../pages/RacesPage').then((module) => ({ default: module.RacesPage })),
)
const SettingsPage = lazy(() =>
  import('../pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)

export function AppRoutes() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">画面を読み込んでいます…</p>}>
      <Routes>
        <Route element={<AppShell />}>
          <Route element={<HomePage />} index />
          <Route element={<RacesPage />} path="races" />
          <Route element={<RaceDetailPage />} path="races/:id" />
          <Route element={<PredictionImportPage />} path="races/:id/import" />
          <Route element={<PredictionEditorPage />} path="races/:id/editor" />
          <Route
            element={<PredictionVersionPage />}
            path="races/:id/predictions/:versionId"
          />
          <Route element={<PurchasesPage />} path="purchases" />
          <Route element={<AnalyticsPage />} path="analytics" />
          <Route element={<SettingsPage />} path="settings" />
          <Route element={<Navigate replace to="/" />} path="*" />
        </Route>
      </Routes>
    </Suspense>
  )
}

export function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AuthProvider>
  )
}
