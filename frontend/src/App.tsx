import { ThemeProvider, CssBaseline } from '@mui/material'
import React, { createContext, useContext } from 'react'
import { useMemo, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthContext, useAuthProvider } from './hooks/useAuth'
import i18n from './i18n'
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
import { api } from './api/client'
import { buildTheme } from './theme'

export const ThemeModeContext = createContext<{
    themeMode: 'light' | 'dark'
    setThemeMode: (mode: 'light' | 'dark') => void
}>({ themeMode: 'light', setThemeMode: () => {} })

export function useThemeMode() {
    return useContext(ThemeModeContext)
}

export default function App() {
    const auth = useAuthProvider()
    const [themeMode, setThemeMode] = useState<'light' | 'dark'>(
        () => (localStorage.getItem('theme') as 'light' | 'dark') ?? 'light'
    )
    const theme = useMemo(() => buildTheme(themeMode), [themeMode])

    useEffect(() => {
        if (auth.user?.theme) {
            setThemeMode(auth.user.theme as 'light' | 'dark')
            localStorage.setItem('theme', auth.user.theme)
        }
    }, [auth.user?.theme])

    useEffect(() => {
        if (auth.user?.language) {
            i18n.changeLanguage(auth.user.language)
            localStorage.setItem('language', auth.user.language)
        }
    }, [auth.user?.language])

    const toggleTheme = () => {
        setThemeMode(mode => {
            const next = mode === 'light' ? 'dark' : 'light'
            localStorage.setItem('theme', next)
            api.put('/api/settings/preferences', { theme: next }).catch(() => {})
            return next
        })
    }

    return (
        <AuthContext value={auth}>
            <ThemeModeContext value={{ themeMode, setThemeMode }}>
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
            </ThemeModeContext>
        </AuthContext>
    )
}
