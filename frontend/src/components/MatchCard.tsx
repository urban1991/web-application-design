import { Box, Card, CardContent, Typography, TextField, Button, Chip } from '@mui/material'
import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'

interface Match {
    id: number
    round: number
    match_number: number
    team1_id?: number
    team2_id?: number
    team1_name?: string
    team2_name?: string
    score1?: number
    score2?: number
    winner_id?: number
    scheduled_at?: string
    status: string
}

interface Props {
    match: Match
    onUpdate?: () => void
}

// Stored value may be 'YYYY-MM-DD HH:mm:ss' or ISO; normalize for parsing.
function parseDate(v?: string): Date | null {
    if (!v) return null
    const d = new Date(v.includes('T') ? v : v.replace(' ', 'T'))
    return isNaN(d.getTime()) ? null : d
}

// Format for a <input type="datetime-local"> value (local time, no seconds).
function toInputValue(v?: string): string {
    const d = parseDate(v)
    if (!d) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function MatchCard({ match, onUpdate }: Props) {
    const { t } = useTranslation()
    const { user } = useAuth()
    const [scoreTeamA, setScoreTeamA] = useState(match.score1?.toString() ?? '')
    const [scoreTeamB, setScoreTeamB] = useState(match.score2?.toString() ?? '')
    const [schedule, setSchedule] = useState(toInputValue(match.scheduled_at))
    const [saving, setSaving] = useState(false)
    const [scheduling, setScheduling] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Resync inputs when the match data changes (e.g. after a WebSocket update).
    useEffect(() => {
        setScoreTeamA(match.score1?.toString() ?? '')
        setScoreTeamB(match.score2?.toString() ?? '')
        setSchedule(toInputValue(match.scheduled_at))
    }, [match.score1, match.score2, match.scheduled_at])

    const canEdit = user?.roles?.some(r => r === 0 || r === 1)
    const isFinished = match.status === 'finished'

    const handleSave = async () => {
        const scoreA = parseInt(scoreTeamA, 10)
        const scoreB = parseInt(scoreTeamB, 10)
        if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
            setError(t('match.scoresRequired'))
            return
        }
        if (scoreA === scoreB) {
            setError(t('match.drawNotAllowed'))
            return
        }
        setSaving(true)
        setError(null)
        try {
            await api.put(`/api/match/${match.id}/score`, { score1: scoreA, score2: scoreB })
            onUpdate?.()
        } catch (err) {
            setError(err instanceof Error ? err.message : t('common.error'))
        } finally {
            setSaving(false)
        }
    }

    const handleSchedule = async () => {
        if (!schedule) {
            setError(t('match.dateRequired'))
            return
        }
        setScheduling(true)
        setError(null)
        try {
            await api.put(`/api/match/${match.id}/schedule`, { scheduled_at: schedule })
            onUpdate?.()
        } catch (err) {
            setError(err instanceof Error ? err.message : t('common.error'))
        } finally {
            setScheduling(false)
        }
    }

    const scheduledDate = parseDate(match.scheduled_at)

    let statusColor: 'success' | 'warning' | 'default' = 'default'
    if (match.status === 'finished') {
        statusColor = 'success'
    } else if (match.status === 'in_progress') {
        statusColor = 'warning'
    }

    return (
        <Card variant="outlined" sx={{ minWidth: 160, mb: 1 }}>
            <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mb: 0.5,
                    }}
                >
                    <Typography
                        variant="body2"
                        sx={{
                            fontWeight:
                                match.winner_id === match.team1_id && match.winner_id
                                    ? 'bold'
                                    : 'normal',
                        }}
                    >
                        {match.team1_name ?? 'TBD'}
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{
                            fontWeight: 'bold',
                        }}
                    >
                        {match.score1 ?? '-'}
                    </Typography>
                </Box>
                <Typography
                    variant="caption"
                    sx={{
                        color: 'text.secondary',
                        display: 'block',
                        textAlign: 'center',
                    }}
                >
                    vs
                </Typography>
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mt: 0.5,
                    }}
                >
                    <Typography
                        variant="body2"
                        sx={{
                            fontWeight:
                                match.winner_id === match.team2_id && match.winner_id
                                    ? 'bold'
                                    : 'normal',
                        }}
                    >
                        {match.team2_name ?? 'TBD'}
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{
                            fontWeight: 'bold',
                        }}
                    >
                        {match.score2 ?? '-'}
                    </Typography>
                </Box>
                <Box
                    sx={{
                        mt: 0.5,
                        display: 'flex',
                        justifyContent: 'center',
                    }}
                >
                    <Chip
                        label={match.status}
                        color={statusColor as 'success' | 'warning' | 'default'}
                        size="small"
                    />
                </Box>
                {scheduledDate && (
                    <Typography
                        variant="caption"
                        sx={{
                            display: 'block',
                            textAlign: 'center',
                            color: 'text.secondary',
                            mt: 0.5,
                        }}
                    >
                        {scheduledDate.toLocaleString()}
                    </Typography>
                )}
                {canEdit && !isFinished && (
                    <Box
                        sx={{
                            mt: 1,
                        }}
                    >
                        <Box
                            sx={{
                                display: 'flex',
                                gap: 1,
                                mb: 0.5,
                            }}
                        >
                            <TextField
                                size="small"
                                type="number"
                                value={scoreTeamA}
                                onChange={e => setScoreTeamA(e.target.value)}
                                slotProps={{ htmlInput: { min: 0 } }}
                                sx={{ width: 60 }}
                            />
                            <TextField
                                size="small"
                                type="number"
                                value={scoreTeamB}
                                onChange={e => setScoreTeamB(e.target.value)}
                                slotProps={{ htmlInput: { min: 0 } }}
                                sx={{ width: 60 }}
                            />
                        </Box>
                        <Button
                            size="small"
                            variant="contained"
                            onClick={handleSave}
                            disabled={saving}
                            fullWidth
                        >
                            {t('match.updateScore')}
                        </Button>
                        <TextField
                            size="small"
                            type="datetime-local"
                            value={schedule}
                            onChange={e => setSchedule(e.target.value)}
                            fullWidth
                            sx={{ mt: 1 }}
                        />
                        <Button
                            size="small"
                            variant="outlined"
                            onClick={handleSchedule}
                            disabled={scheduling}
                            fullWidth
                            sx={{ mt: 0.5 }}
                        >
                            {t('match.setDate')}
                        </Button>
                        {error && (
                            <Typography
                                variant="caption"
                                color="error"
                                sx={{ display: 'block', mt: 0.5 }}
                            >
                                {error}
                            </Typography>
                        )}
                    </Box>
                )}
            </CardContent>
        </Card>
    )
}
