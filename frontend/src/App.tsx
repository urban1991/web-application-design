import { ThemeProvider, CssBaseline } from '@mui/material'
import React from 'react'
import { useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthContext, useAuthProvider } from './hooks/useAuth'
import Audit from './pages/Audit'
import Dashboard from './pages/Dashboard'
import ImportPage from './pages/ImportPage'
import Login from './pages/Login'
import Players from './pages/Players'
import Settings from './pages/Settings'
import TeamDetail from './pages/TeamDetail'
import Teams from './pages/Teams'
import TournamentDetail from './pages/TournamentDetail'
import Tournaments from './pages/Tournaments'
import { buildTheme } from './theme'

export default function App() {
    const auth = useAuthProvider()
    const [themeMode, setThemeMode] = useState<'light' | 'dark'>(
        () => (localStorage.getItem('theme') as 'light' | 'dark') ?? 'light'
    )
    const theme = useMemo(() => buildTheme(themeMode), [themeMode])

    const toggleTheme = () => {
        setThemeMode(m => {
            const next = m === 'light' ? 'dark' : 'light'
            localStorage.setItem('theme', next)
            return next
        })
    }

    return (
        <AuthContext value={auth}>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                <BrowserRouter>
                    <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route element={<ProtectedRoute />}>
                            <Route
                                element={
                                    <Layout themeMode={themeMode} onToggleTheme={toggleTheme} />
                                }
                            >
                                <Route path="/" element={<Dashboard />} />
                                <Route path="/tournaments" element={<Tournaments />} />
                                <Route path="/tournaments/:id" element={<TournamentDetail />} />
                                <Route path="/teams" element={<Teams />} />
                                <Route path="/teams/:id" element={<TeamDetail />} />
                                <Route path="/players" element={<Players />} />
                                <Route path="/import" element={<ImportPage />} />
                                <Route path="/audit" element={<Audit />} />
                                <Route path="/settings" element={<Settings />} />
                            </Route>
                        </Route>
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </BrowserRouter>
            </ThemeProvider>
        </AuthContext>
    )
}
