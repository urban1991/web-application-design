import { useState, useEffect, createContext, use } from 'react'
import { api } from '../api/client'

export interface User {
    id: number
    username: string
    roles: number[]
    theme: string
    language: string
    mfa_enabled: number
}

interface AuthCtx {
    user: User | null | undefined
    loading: boolean
    login: (user: string, password: string, mfa?: string) => Promise<{ mfa_required?: boolean }>
    logout: () => Promise<void>
    refresh: () => Promise<void>
}

export const AuthContext = createContext<AuthCtx>(null!)

export function useAuth() {
    return use(AuthContext)
}

export function useAuthProvider(): AuthCtx {
    const [user, setUser] = useState<User | null | undefined>(undefined)
    const [loading, setLoading] = useState(true)

    const refresh = async () => {
        try {
            setUser(await api.get<User | null>('/api/auth/me'))
        } catch {
            setUser(null)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        refresh()
    }, [])

    const login = async (username: string, password: string, mfa_token?: string) => {
        const res = await api.post<User & { mfa_required?: boolean }>('/api/auth/login', {
            username,
            password,
            mfa_token,
        })
        if (res.mfa_required) return { mfa_required: true }
        setUser(res)
        return {}
    }

    const logout = async () => {
        await api.post('/api/auth/logout')
        setUser(null)
    }

    return { user, loading, login, logout, refresh }
}
