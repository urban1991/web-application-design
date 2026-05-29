import {
    Box,
    Typography,
    Card,
    CardContent,
    RadioGroup,
    FormControlLabel,
    Radio,
    FormControl,
    FormLabel,
    Select,
    MenuItem,
    Button,
    TextField,
    Alert,
    CircularProgress,
    Divider,
} from '@mui/material'
import { QRCodeSVG } from 'qrcode.react'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useThemeMode } from '../App'
import { useAuth } from '../hooks/useAuth'

export default function Settings() {
    const { t, i18n } = useTranslation()
    const { user, refresh } = useAuth()
    const { setThemeMode } = useThemeMode()
    const [theme, setTheme] = useState<'light' | 'dark'>(
        () => (localStorage.getItem('theme') as 'light' | 'dark') ?? 'light'
    )
    const [qrUrl, setQrUrl] = useState<string | null>(null)
    const [totpCode, setTotpCode] = useState('')
    const [mfaLoading, setMfaLoading] = useState(false)
    const [mfaMessage, setMfaMessage] = useState<{ msg: string; sev: 'success' | 'error' } | null>(
        null
    )

    const handleThemeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value as 'light' | 'dark'
        setTheme(val)
        setThemeMode(val)
        localStorage.setItem('theme', val)
        try {
            await api.put('/api/settings/preferences', { theme: val })
        } catch {
            // Local preference still applies via localStorage and React state.
        }
    }

    const handleLangChange = (lang: string) => {
        i18n.changeLanguage(lang)
        localStorage.setItem('language', lang)
        api.put('/api/settings/preferences', { language: lang }).catch(() => {})
    }

    const handleEnableMfa = async () => {
        setMfaLoading(true)
        try {
            const res = await api.post<{ otpauthUrl?: string; otpauth_url?: string }>(
                '/api/settings/mfa/setup'
            )
            setQrUrl(res.otpauthUrl ?? res.otpauth_url ?? null)
            setMfaMessage(null)
        } catch (err) {
            setMfaMessage({
                msg: err instanceof Error ? err.message : t('common.error'),
                sev: 'error',
            })
        } finally {
            setMfaLoading(false)
        }
    }

    const handleVerifyMfa = async () => {
        setMfaLoading(true)
        try {
            await api.post('/api/settings/mfa/verify', { token: totpCode })
            setQrUrl(null)
            setTotpCode('')
            setMfaMessage({ msg: t('common.success'), sev: 'success' })
            await refresh()
        } catch (err) {
            setMfaMessage({
                msg: err instanceof Error ? err.message : t('common.error'),
                sev: 'error',
            })
        } finally {
            setMfaLoading(false)
        }
    }

    const handleDisableMfa = async () => {
        setMfaLoading(true)
        try {
            await api.post('/api/settings/mfa/disable')
            setMfaMessage({ msg: t('common.success'), sev: 'success' })
            await refresh()
        } catch (err) {
            setMfaMessage({
                msg: err instanceof Error ? err.message : t('common.error'),
                sev: 'error',
            })
        } finally {
            setMfaLoading(false)
        }
    }

    return (
        <Box>
            <Typography
                variant="h5"
                sx={{
                    mb: 3,
                }}
            >
                {t('nav.settings')}
            </Typography>
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Typography
                        variant="h6"
                        sx={{
                            mb: 2,
                        }}
                    >
                        {t('settings.preferences')}
                    </Typography>

                    <FormControl component="fieldset" sx={{ mb: 3, display: 'block' }}>
                        <FormLabel component="legend">{t('settings.theme')}</FormLabel>
                        <RadioGroup row value={theme} onChange={handleThemeChange}>
                            <FormControlLabel
                                value="light"
                                control={<Radio />}
                                label={t('settings.light')}
                            />
                            <FormControlLabel
                                value="dark"
                                control={<Radio />}
                                label={t('settings.dark')}
                            />
                        </RadioGroup>
                    </FormControl>

                    <FormControl sx={{ minWidth: 160 }}>
                        <FormLabel>{t('settings.language')}</FormLabel>
                        <Select
                            value={i18n.language.startsWith('pl') ? 'pl' : 'en'}
                            onChange={e => handleLangChange(e.target.value)}
                            size="small"
                            sx={{ mt: 1 }}
                        >
                            <MenuItem value="pl">Polski</MenuItem>
                            <MenuItem value="en">English</MenuItem>
                        </Select>
                    </FormControl>
                </CardContent>
            </Card>
            <Card>
                <CardContent>
                    <Typography
                        variant="h6"
                        sx={{
                            mb: 2,
                        }}
                    >
                        {t('settings.mfa')}
                    </Typography>

                    {mfaMessage && (
                        <Alert severity={mfaMessage.sev} sx={{ mb: 2 }}>
                            {mfaMessage.msg}
                        </Alert>
                    )}

                    {user?.mfa_enabled ? (
                        <Box>
                            <Alert severity="success" sx={{ mb: 2 }}>
                                {t('settings.mfaEnabled')}
                            </Alert>
                            <Button
                                variant="outlined"
                                color="error"
                                onClick={handleDisableMfa}
                                disabled={mfaLoading}
                                startIcon={mfaLoading ? <CircularProgress size={16} /> : null}
                            >
                                {t('settings.disableMfa')}
                            </Button>
                        </Box>
                    ) : (
                        <Box>
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                {t('settings.mfaDisabled')}
                            </Alert>
                            {!qrUrl ? (
                                <Button
                                    variant="contained"
                                    onClick={handleEnableMfa}
                                    disabled={mfaLoading}
                                    startIcon={mfaLoading ? <CircularProgress size={16} /> : null}
                                >
                                    {t('settings.enableMfa')}
                                </Button>
                            ) : (
                                <Box>
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            mb: 2,
                                        }}
                                    >
                                        {t('settings.scanQr')}
                                    </Typography>
                                    <Box
                                        sx={{
                                            mb: 2,
                                        }}
                                    >
                                        <QRCodeSVG value={qrUrl} size={200} />
                                    </Box>
                                    <Divider sx={{ my: 2 }} />
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            mb: 1,
                                        }}
                                    >
                                        {t('settings.enterCode')}
                                    </Typography>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            gap: 2,
                                            alignItems: 'center',
                                        }}
                                    >
                                        <TextField
                                            size="small"
                                            value={totpCode}
                                            onChange={e => setTotpCode(e.target.value)}
                                            slotProps={{
                                                htmlInput: { maxLength: 6, pattern: '[0-9]*' },
                                            }}
                                            placeholder="000000"
                                            sx={{ width: 120 }}
                                        />
                                        <Button
                                            variant="contained"
                                            onClick={handleVerifyMfa}
                                            disabled={totpCode.length !== 6 || mfaLoading}
                                        >
                                            {t('settings.verify')}
                                        </Button>
                                    </Box>
                                </Box>
                            )}
                        </Box>
                    )}
                </CardContent>
            </Card>
        </Box>
    )
}
