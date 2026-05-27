import {
    Box,
    Card,
    CardContent,
    TextField,
    Button,
    Typography,
    Alert,
    CircularProgress,
} from '@mui/material'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
    const { t } = useTranslation()
    const { login } = useAuth()
    const navigate = useNavigate()

    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [mfaToken, setMfaToken] = useState('')
    const [mfaStep, setMfaStep] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.SubmitEvent) => {
        e.preventDefault()
        setError(null)
        setLoading(true)
        try {
            const res = await login(
                username,
                password,
                mfaStep ? mfaToken : undefined
            )
            if (res.mfa_required) {
                setMfaStep(true)
            } else {
                navigate('/')
            }
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
                        sx={{
                            textAlign: 'center',
                            mb: 3,
                            fontWeight: 'bold',
                        }}
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
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2,
                        }}
                    >
                        {!mfaStep ? (
                            <>
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
                                    autoComplete="current-password"
                                />
                            </>
                        ) : (
                            <>
                                <Typography
                                    variant="body2"
                                    sx={{
                                        color: 'text.secondary',
                                        textAlign: 'center',
                                    }}
                                >
                                    {t('auth.mfaRequired')}
                                </Typography>
                                <TextField
                                    label={t('auth.mfaToken')}
                                    value={mfaToken}
                                    onChange={e => setMfaToken(e.target.value)}
                                    required
                                    fullWidth
                                    autoFocus
                                    slotProps={{ htmlInput: { maxLength: 6, pattern: '[0-9]*' } }}
                                    helperText={t('auth.enterMfa')}
                                />
                            </>
                        )}

                        <Button
                            type="submit"
                            variant="contained"
                            fullWidth
                            size="large"
                            disabled={loading}
                        >
                            {loading ? <CircularProgress size={24} /> : t('auth.login')}
                        </Button>
                    </Box>
                </CardContent>
            </Card>
        </Box>
    )
}
