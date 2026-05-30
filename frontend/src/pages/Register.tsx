import {
    Box,
    Card,
    CardContent,
    TextField,
    Button,
    Typography,
    Alert,
    CircularProgress,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
} from '@mui/material'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'

export default function Register() {
    const { t } = useTranslation()
    const navigate = useNavigate()

    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [email, setEmail] = useState('')
    const [role, setRole] = useState<1 | 2>(2)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (password.length < 6) {
            setError(t('auth.passwordTooShort'))
            return
        }
        if (password !== confirmPassword) {
            setError(t('auth.passwordMismatch'))
            return
        }

        setLoading(true)
        try {
            await api.post('/api/auth/register', {
                username,
                password,
                role,
                email: email.trim() || undefined,
            })
            navigate('/login?registered=1')
        } catch (err) {
            setError(err instanceof Error ? err.message : t('common.error'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <Box
            sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '100vh',
                bgcolor: 'background.default',
            }}
        >
            <Card sx={{ width: '100%', maxWidth: 400, mx: 2 }}>
                <CardContent sx={{ p: 4 }}>
                    <Typography
                        variant="h5"
                        sx={{ textAlign: 'center', mb: 3, fontWeight: 'bold' }}
                    >
                        Tournament Manager
                    </Typography>

                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}

                    <Box
                        component="form"
                        onSubmit={handleSubmit}
                        sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                    >
                        <TextField
                            label={t('auth.username')}
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            required
                            fullWidth
                            autoFocus
                            autoComplete="username"
                        />
                        <TextField
                            label={t('auth.password')}
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            fullWidth
                            autoComplete="new-password"
                        />
                        <TextField
                            label={t('auth.confirmPassword')}
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            required
                            fullWidth
                            autoComplete="new-password"
                        />
                        <TextField
                            label="Email"
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            fullWidth
                            autoComplete="email"
                        />
                        <FormControl fullWidth required>
                            <InputLabel>{t('auth.role')}</InputLabel>
                            <Select
                                value={role}
                                label={t('auth.role')}
                                onChange={e => setRole(e.target.value as 1 | 2)}
                            >
                                <MenuItem value={2}>{t('auth.roleCapitan')}</MenuItem>
                                <MenuItem value={1}>{t('auth.roleOrganizer')}</MenuItem>
                            </Select>
                        </FormControl>

                        <Button
                            type="submit"
                            variant="contained"
                            fullWidth
                            size="large"
                            disabled={loading}
                        >
                            {loading ? <CircularProgress size={24} /> : t('auth.register')}
                        </Button>

                        <Typography variant="body2" sx={{ textAlign: 'center', mt: 1 }}>
                            <Link to="/login" style={{ color: 'inherit' }}>
                                {t('auth.alreadyHaveAccount')}
                            </Link>
                        </Typography>
                    </Box>
                </CardContent>
            </Card>
        </Box>
    )
}
