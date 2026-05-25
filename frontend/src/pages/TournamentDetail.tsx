import DeleteIcon from '@mui/icons-material/Delete'
import {
    Box,
    Typography,
    Button,
    Card,
    CardContent,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    MenuItem,
    Select,
    FormControl,
    InputLabel,
    IconButton,
    CircularProgress,
    Snackbar,
    Alert,
} from '@mui/material'
import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { api } from '../api/client'
import BracketView from '../components/BracketView'
import { useAuth } from '../hooks/useAuth'
import { useWebSocket } from '../hooks/useWebSocket'

interface Tournament {
    id: number
    name: string
    sport: string
    start_date: string
    end_date: string
    status: string
}

interface Team {
    id: number
    name: string
    shortname: string
}

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

interface Standing {
    team_id: number
    team_name: string
    wins: number
    losses: number
    points: number
}

export default function TournamentDetail() {
    const { id } = useParams<{ id: string }>()
    const { t } = useTranslation()
    const { user } = useAuth()
    const [tournament, setTournament] = useState<Tournament | null>(null)
    const [registeredTeams, setRegisteredTeams] = useState<Team[]>([])
    const [allTeams, setAllTeams] = useState<Team[]>([])
    const [matches, setMatches] = useState<Match[]>([])
    const [standings, setStandings] = useState<Standing[]>([])
    const [loading, setLoading] = useState(true)
    const [addTeamOpen, setAddTeamOpen] = useState(false)
    const [selectedTeam, setSelectedTeam] = useState('')
    const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null)

    const canEdit = user?.roles?.some(r => r === 0 || r === 1)

    const loadData = useCallback(async () => {
        if (!id) return
        try {
            const [tRes, registeredRes, matchesRes, allTeamsRes, standingsRes] = await Promise.all([
                api.get<Tournament>(`/api/tournament/${id}`),
                api.get<Team[]>(`/api/tournament/${id}/teams`).catch(() => []),
                api.get<Match[]>(`/api/tournament/${id}/bracket`).catch(() => []),
                api.get<{ data: Team[] }>('/api/team?limit=200'),
                api.get<Standing[]>(`/api/tournament/${id}/standings`).catch(() => []),
            ])
            setTournament(tRes)
            setAllTeams(allTeamsRes.data ?? [])
            setRegisteredTeams(Array.isArray(registeredRes) ? registeredRes : [])
            setMatches(Array.isArray(matchesRes) ? matchesRes : [])
            setStandings(Array.isArray(standingsRes) ? standingsRes : [])
        } catch (err) {
            setSnack({ msg: err instanceof Error ? err.message : t('common.error'), sev: 'error' })
        } finally {
            setLoading(false)
        }
    }, [id, t])

    useEffect(() => {
        loadData()
    }, [loadData])

    useWebSocket(`tournament:${id}`, () => {
        loadData()
    })

    const handleAddTeam = async () => {
        try {
            await api.post(`/api/tournament/${id}/register-team`, {
                team_id: parseInt(selectedTeam),
            })
            setAddTeamOpen(false)
            setSnack({ msg: t('common.success'), sev: 'success' })
            loadData()
        } catch (err) {
            setSnack({ msg: err instanceof Error ? err.message : t('common.error'), sev: 'error' })
        }
    }

    const handleRemoveTeam = async (teamId: number) => {
        try {
            await api.delete(`/api/tournament/${id}/team/${teamId}`)
            setSnack({ msg: t('common.success'), sev: 'success' })
            loadData()
        } catch (err) {
            setSnack({ msg: err instanceof Error ? err.message : t('common.error'), sev: 'error' })
        }
    }

    const handleGenerateBracket = async () => {
        try {
            await api.post(`/api/tournament/${id}/generate-bracket`)
            setSnack({ msg: t('common.success'), sev: 'success' })
            loadData()
        } catch (err) {
            setSnack({ msg: err instanceof Error ? err.message : t('common.error'), sev: 'error' })
        }
    }

    if (loading) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    mt: 4,
                }}
            >
                <CircularProgress />
            </Box>
        )
    }

    if (!tournament) {
        return <Typography>{t('common.noData')}</Typography>
    }

    const availableTeams = allTeams.filter(t => !registeredTeams.some(r => r.id === t.id))

    return (
        <Box>
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    mb: 3,
                }}
            >
                <Box>
                    <Typography variant="h4">{tournament.name}</Typography>
                    <Typography
                        variant="body1"
                        sx={{
                            color: 'text.secondary',
                        }}
                    >
                        {tournament.sport} | {tournament.start_date?.split('T')[0]} —{' '}
                        {tournament.end_date?.split('T')[0]}
                    </Typography>
                    <Chip
                        label={t(`tournament.${tournament.status}`) || tournament.status}
                        color={tournament.status === 'active' ? 'success' : 'default'}
                        sx={{ mt: 1 }}
                    />
                </Box>
                <Box
                    sx={{
                        display: 'flex',
                        gap: 1,
                        flexWrap: 'wrap',
                    }}
                >
                    {canEdit && (
                        <Button variant="outlined" onClick={handleGenerateBracket}>
                            {t('tournament.generateBracket')}
                        </Button>
                    )}
                    <Button variant="outlined" href={`/api/tournament/${id}/pdf`} target="_blank">
                        {t('tournament.downloadPdf')}
                    </Button>
                </Box>
            </Box>
            <Typography
                variant="h6"
                sx={{
                    mb: 1,
                }}
            >
                {t('tournament.registeredTeams')}
            </Typography>
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>{t('team.name')}</TableCell>
                                    <TableCell>{t('team.shortname')}</TableCell>
                                    {canEdit && <TableCell>{t('common.actions')}</TableCell>}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {registeredTeams.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={3} align="center">
                                            {t('common.noData')}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    registeredTeams.map(team => (
                                        <TableRow key={team.id}>
                                            <TableCell>{team.name}</TableCell>
                                            <TableCell>{team.shortname}</TableCell>
                                            {canEdit && (
                                                <TableCell>
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={() => handleRemoveTeam(team.id)}
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    {canEdit && (
                        <Button
                            variant="outlined"
                            startIcon={<span>+</span>}
                            onClick={() => setAddTeamOpen(true)}
                            sx={{ mt: 1 }}
                        >
                            {t('tournament.addTeam')}
                        </Button>
                    )}
                </CardContent>
            </Card>
            {matches.length > 0 && (
                <>
                    <Typography
                        variant="h6"
                        sx={{
                            mb: 1,
                        }}
                    >
                        {t('tournament.bracket')}
                    </Typography>
                    <Card sx={{ mb: 3, overflowX: 'auto' }}>
                        <CardContent>
                            <BracketView matches={matches} onUpdate={loadData} />
                        </CardContent>
                    </Card>
                </>
            )}
            {standings.length > 0 && (
                <>
                    <Typography
                        variant="h6"
                        sx={{
                            mb: 1,
                        }}
                    >
                        {t('tournament.standings')}
                    </Typography>
                    <Card>
                        <CardContent>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>#</TableCell>
                                            <TableCell>{t('team.name')}</TableCell>
                                            <TableCell>W</TableCell>
                                            <TableCell>L</TableCell>
                                            <TableCell>Pts</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {standings.map((s, i) => (
                                            <TableRow key={s.team_id}>
                                                <TableCell>{i + 1}</TableCell>
                                                <TableCell>{s.team_name}</TableCell>
                                                <TableCell>{s.wins}</TableCell>
                                                <TableCell>{s.losses}</TableCell>
                                                <TableCell>{s.points}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </CardContent>
                    </Card>
                </>
            )}
            <Dialog open={addTeamOpen} onClose={() => setAddTeamOpen(false)}>
                <DialogTitle>{t('tournament.addTeam')}</DialogTitle>
                <DialogContent sx={{ minWidth: 300 }}>
                    <FormControl fullWidth sx={{ mt: 1 }}>
                        <InputLabel>{t('team.name')}</InputLabel>
                        <Select
                            value={selectedTeam}
                            label={t('team.name')}
                            onChange={e => setSelectedTeam(e.target.value)}
                        >
                            {availableTeams.map(team => (
                                <MenuItem key={team.id} value={String(team.id)}>
                                    {team.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddTeamOpen(false)}>{t('common.cancel')}</Button>
                    <Button variant="contained" onClick={handleAddTeam} disabled={!selectedTeam}>
                        {t('common.add')}
                    </Button>
                </DialogActions>
            </Dialog>
            <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)}>
                <Alert severity={snack?.sev} onClose={() => setSnack(null)}>
                    {snack?.msg}
                </Alert>
            </Snackbar>
        </Box>
    )
}
