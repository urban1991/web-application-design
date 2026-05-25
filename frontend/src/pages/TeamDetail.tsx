import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import {
    Box,
    Typography,
    Card,
    CardContent,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    IconButton,
    CircularProgress,
    Snackbar,
    Alert,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
} from '@mui/material'
import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'

interface Team {
    id: number
    name: string
    shortname: string
    captain_id?: number
}

interface Player {
    id: number
    firstname: string
    lastname: string
    position?: string
    team_id?: number
}

export default function TeamDetail() {
    const { id } = useParams<{ id: string }>()
    const { t } = useTranslation()
    const { user } = useAuth()
    const [team, setTeam] = useState<Team | null>(null)
    const [players, setPlayers] = useState<Player[]>([])
    const [allPlayers, setAllPlayers] = useState<Player[]>([])
    const [loading, setLoading] = useState(true)
    const [editOpen, setEditOpen] = useState(false)
    const [addPlayerOpen, setAddPlayerOpen] = useState(false)
    const [form, setForm] = useState({ name: '', shortname: '' })
    const [selectedPlayer, setSelectedPlayer] = useState('')
    const [snack, setSnack] = useState<{
        msg: string
        sev: 'success' | 'error'
    } | null>(null)

    const isAdminOrOrganizer = user?.roles?.some(r => r === 0 || r === 1) ?? false
    const isOwnCaptain = !!user?.roles?.includes(2) && team?.captain_id === user?.id
    const canEdit = isAdminOrOrganizer || isOwnCaptain

    const loadData = useCallback(async () => {
        if (!id) return
        try {
            const [teamRes, allPlayersRes] = await Promise.all([
                api.get<Team & { players?: Player[] }>(`/api/team/${id}`),
                api.get<{ data: Player[] }>('/api/player?limit=500').catch(() => ({ data: [] })),
            ])
            setTeam(teamRes)
            setPlayers(teamRes.players ?? [])
            setAllPlayers(allPlayersRes.data ?? [])
            setForm({ name: teamRes.name, shortname: teamRes.shortname })
        } catch (err) {
            setSnack({
                msg: err instanceof Error ? err.message : t('common.error'),
                sev: 'error',
            })
        } finally {
            setLoading(false)
        }
    }, [id, t])

    useEffect(() => {
        loadData()
    }, [loadData])

    const handleEditSave = async () => {
        try {
            await api.put(`/api/team/${id}`, form)
            setEditOpen(false)
            setSnack({ msg: t('common.success'), sev: 'success' })
            loadData()
        } catch (err) {
            setSnack({
                msg: err instanceof Error ? err.message : t('common.error'),
                sev: 'error',
            })
        }
    }

    const handleAddPlayer = async () => {
        try {
            await api.put(`/api/player/${selectedPlayer}`, {
                team_id: parseInt(id!),
            })
            setAddPlayerOpen(false)
            setSnack({ msg: t('common.success'), sev: 'success' })
            loadData()
        } catch (err) {
            setSnack({
                msg: err instanceof Error ? err.message : t('common.error'),
                sev: 'error',
            })
        }
    }

    const handleRemovePlayer = async (playerId: number) => {
        try {
            await api.put(`/api/player/${playerId}`, { team_id: null })
            setSnack({ msg: t('common.success'), sev: 'success' })
            loadData()
        } catch (err) {
            setSnack({
                msg: err instanceof Error ? err.message : t('common.error'),
                sev: 'error',
            })
        }
    }

    if (loading)
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
    if (!team) return <Typography>{t('common.noData')}</Typography>

    const unassignedPlayers = allPlayers.filter(p => !p.team_id)

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
                    <Typography variant="h4">{team.name}</Typography>
                    <Typography
                        variant="body1"
                        sx={{
                            color: 'text.secondary',
                        }}
                    >
                        {team.shortname}
                    </Typography>
                </Box>
                {canEdit && (
                    <Button
                        variant="outlined"
                        startIcon={<EditIcon />}
                        onClick={() => setEditOpen(true)}
                    >
                        {t('team.edit')}
                    </Button>
                )}
            </Box>
            <Card>
                <CardContent>
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            mb: 2,
                        }}
                    >
                        <Typography variant="h6">{t('team.players')}</Typography>
                        {canEdit && (
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<AddIcon />}
                                onClick={() => setAddPlayerOpen(true)}
                            >
                                {t('common.add')}
                            </Button>
                        )}
                    </Box>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>{t('player.firstname')}</TableCell>
                                    <TableCell>{t('player.lastname')}</TableCell>
                                    <TableCell>{t('player.position')}</TableCell>
                                    {canEdit && <TableCell>{t('common.actions')}</TableCell>}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {players.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} align="center">
                                            {t('common.noData')}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    players.map(p => (
                                        <TableRow key={p.id}>
                                            <TableCell>{p.firstname}</TableCell>
                                            <TableCell>{p.lastname}</TableCell>
                                            <TableCell>{p.position ?? '-'}</TableCell>
                                            {canEdit && (
                                                <TableCell>
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={() => handleRemovePlayer(p.id)}
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
                </CardContent>
            </Card>
            <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{t('team.edit')}</DialogTitle>
                <DialogContent>
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2,
                            mt: 1,
                        }}
                    >
                        <TextField
                            label={t('team.name')}
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                            fullWidth
                        />
                        <TextField
                            label={t('team.shortname')}
                            value={form.shortname}
                            onChange={e => setForm({ ...form, shortname: e.target.value })}
                            fullWidth
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditOpen(false)}>{t('common.cancel')}</Button>
                    <Button variant="contained" onClick={handleEditSave}>
                        {t('common.save')}
                    </Button>
                </DialogActions>
            </Dialog>
            <Dialog open={addPlayerOpen} onClose={() => setAddPlayerOpen(false)}>
                <DialogTitle>
                    {t('common.add')} {t('nav.players')}
                </DialogTitle>
                <DialogContent sx={{ minWidth: 300 }}>
                    <FormControl fullWidth sx={{ mt: 1 }}>
                        <InputLabel>{t('player.firstname')}</InputLabel>
                        <Select
                            value={selectedPlayer}
                            label={t('player.firstname')}
                            onChange={e => setSelectedPlayer(e.target.value)}
                        >
                            {unassignedPlayers.map(p => (
                                <MenuItem key={p.id} value={String(p.id)}>
                                    {p.firstname} {p.lastname}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddPlayerOpen(false)}>{t('common.cancel')}</Button>
                    <Button
                        variant="contained"
                        onClick={handleAddPlayer}
                        disabled={!selectedPlayer}
                    >
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
