import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../features/auth/AuthProvider'
import { AnalyticsPage } from '../pages/AnalyticsPage'
import { HomePage } from '../pages/HomePage'
import { PurchasesPage } from '../pages/PurchasesPage'
import { RacesPage } from '../pages/RacesPage'
import { SettingsPage } from '../pages/SettingsPage'
import { AppShell } from './AppShell'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route element={<HomePage />} index />
        <Route element={<RacesPage />} path="races" />
        <Route element={<PurchasesPage />} path="purchases" />
        <Route element={<AnalyticsPage />} path="analytics" />
        <Route element={<SettingsPage />} path="settings" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Route>
    </Routes>
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
