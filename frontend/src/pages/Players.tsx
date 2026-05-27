import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import {
    Box,
    Button,
    TextField,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    Typography,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Pagination,
    CircularProgress,
    Snackbar,
    Alert,
    MenuItem,
    Select,
    FormControl,
    InputLabel,
    Card,
    CardContent,
    Stack,
    useTheme,
    useMediaQuery,
} from '@mui/material'
import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'

interface Player {
    id: number
    firstname: string
    lastname: string
    position?: string
    team_id?: number
    team_name?: string
}

interface Team {
    id: number
    name: string
}

interface PagedResult {
    data: Player[]
    total: number
}

const PAGE_SIZE = 20

interface PlayerCardProps {
    row: Player
    canEdit: boolean
    onEdit: () => void
    onDelete: () => void
}

function PlayerCard({ row, canEdit, onEdit, onDelete }: PlayerCardProps) {
    return (
        <Card variant="outlined" sx={{ mb: 1 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box
                    sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                    <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                            {row.firstname} {row.lastname}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {row.position ?? '-'} · {row.team_name ?? '-'}
                        </Typography>
                    </Box>
                    {canEdit && (
                        <Box>
                            <IconButton size="small" onClick={onEdit}>
                                <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" color="error" onClick={onDelete}>
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    )}
                </Box>
            </CardContent>
        </Card>
    )
}

export default function Players() {
    const { t } = useTranslation()
    const { user } = useAuth()
    const [players, setPlayers] = useState<Player[]>([])
    const [teams, setTeams] = useState<Team[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [teamFilter, setTeamFilter] = useState('')
    const [loading, setLoading] = useState(false)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editItem, setEditItem] = useState<Player | null>(null)
    const [form, setForm] = useState({ firstname: '', lastname: '', position: '', team_id: '' })
    const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null)

    const canEdit = user?.roles?.some(r => r === 0 || r === 1)
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const offset = (page - 1) * PAGE_SIZE
            const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
            if (search) params.set('q', search)
            if (teamFilter) params.set('team_id', teamFilter)
            const res = await api.get<PagedResult>(`/api/player?${params}`)
            setPlayers(res.data ?? [])
            setTotal(res.total ?? 0)
        } catch {
            // ignore
        } finally {
            setLoading(false)
        }
    }, [page, search, teamFilter])

    useEffect(() => {
        load()
    }, [load])
    useEffect(() => {
        api.get<{ data: Team[] }>('/api/team?limit=200')
            .then(r => setTeams(r.data ?? []))
            .catch(() => {})
    }, [])

    const openCreate = () => {
        setEditItem(null)
        setForm({ firstname: '', lastname: '', position: '', team_id: '' })
        setDialogOpen(true)
    }

    const openEdit = (p: Player) => {
        setEditItem(p)
        setForm({
            firstname: p.firstname,
            lastname: p.lastname,
            position: p.position ?? '',
            team_id: p.team_id ? String(p.team_id) : '',
        })
        setDialogOpen(true)
    }

    const handleSave = async () => {
        try {
            const payload = {
                firstname: form.firstname,
                lastname: form.lastname,
                position: form.position || undefined,
                team_id: form.team_id ? parseInt(form.team_id) : undefined,
            }
            if (editItem) {
                await api.put(`/api/player/${editItem.id}`, payload)
            } else {
                await api.post('/api/player', payload)
            }
            setDialogOpen(false)
            setSnack({ msg: t('common.success'), sev: 'success' })
            load()
        } catch (err) {
            setSnack({ msg: err instanceof Error ? err.message : t('common.error'), sev: 'error' })
        }
    }

    const handleDelete = async (id: number) => {
        if (!window.confirm(t('common.confirm'))) return
        try {
            await api.delete(`/api/player/${id}`)
            setSnack({ msg: t('common.success'), sev: 'success' })
            load()
        } catch (err) {
            setSnack({ msg: err instanceof Error ? err.message : t('common.error'), sev: 'error' })
        }
    }

    return (
        <Box>
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 2,
                }}
            >
                <Typography variant="h5">{t('nav.players')}</Typography>
                {canEdit && (
                    <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                        {t('player.create')}
                    </Button>
                )}
            </Box>
            <Box
                sx={{
                    display: 'flex',
                    gap: 2,
                    mb: 2,
                }}
            >
                <TextField
                    size="small"
                    label={t('common.search')}
                    value={search}
                    onChange={e => {
                        setSearch(e.target.value)
                        setPage(1)
                    }}
                    sx={{ flex: 1 }}
                />
                <FormControl size="small" sx={{ minWidth: 160 }}>
                    <InputLabel>
                        {t('common.filter')} {t('player.team')}
                    </InputLabel>
                    <Select
                        value={teamFilter}
                        label={`${t('common.filter')} ${t('player.team')}`}
                        onChange={e => {
                            setTeamFilter(e.target.value)
                            setPage(1)
                        }}
                    >
                        <MenuItem value="">{t('audit.all')}</MenuItem>
                        {teams.map(team => (
                            <MenuItem key={team.id} value={String(team.id)}>
                                {team.name}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Box>
            {loading ? (
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        mt: 4,
                    }}
                >
                    <CircularProgress />
                </Box>
            ) : (
                <>
                    {isMobile ? (
                        <Stack>
                            {players.length === 0 ? (
                                <Typography
                                    sx={{ color: 'text.secondary', textAlign: 'center', mt: 2 }}
                                >
                                    {t('common.noData')}
                                </Typography>
                            ) : (
                                players.map(row => (
                                    <PlayerCard
                                        key={row.id}
                                        row={row}
                                        canEdit={!!canEdit}
                                        onEdit={() => openEdit(row)}
                                        onDelete={() => handleDelete(row.id)}
                                    />
                                ))
                            )}
                        </Stack>
                    ) : (
                        <TableContainer component={Paper}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t('player.firstname')}</TableCell>
                                        <TableCell>{t('player.lastname')}</TableCell>
                                        <TableCell>{t('player.position')}</TableCell>
                                        <TableCell>{t('player.team')}</TableCell>
                                        {canEdit && <TableCell>{t('common.actions')}</TableCell>}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {players.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} align="center">
                                                {t('common.noData')}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        players.map(row => (
                                            <TableRow key={row.id} hover>
                                                <TableCell>{row.firstname}</TableCell>
                                                <TableCell>{row.lastname}</TableCell>
                                                <TableCell>{row.position ?? '-'}</TableCell>
                                                <TableCell>{row.team_name ?? '-'}</TableCell>
                                                {canEdit && (
                                                    <TableCell>
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => openEdit(row)}
                                                        >
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                        <IconButton
                                                            size="small"
                                                            color="error"
                                                            onClick={() => handleDelete(row.id)}
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
                    )}
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'center',
                            mt: 2,
                        }}
                    >
                        <Pagination
                            count={Math.ceil(total / PAGE_SIZE)}
                            page={page}
                            onChange={(_, p) => setPage(p)}
                        />
                    </Box>
                </>
            )}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{editItem ? t('player.edit') : t('player.create')}</DialogTitle>
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
                            label={t('player.firstname')}
                            value={form.firstname}
                            onChange={e => setForm({ ...form, firstname: e.target.value })}
                            fullWidth
                        />
                        <TextField
                            label={t('player.lastname')}
                            value={form.lastname}
                            onChange={e => setForm({ ...form, lastname: e.target.value })}
                            fullWidth
                        />
                        <TextField
                            label={t('player.position')}
                            value={form.position}
                            onChange={e => setForm({ ...form, position: e.target.value })}
                            fullWidth
                        />
                        <FormControl fullWidth>
                            <InputLabel>{t('player.team')}</InputLabel>
                            <Select
                                value={form.team_id}
                                label={t('player.team')}
                                onChange={e => setForm({ ...form, team_id: e.target.value })}
                            >
                                <MenuItem value="">-</MenuItem>
                                {teams.map(team => (
                                    <MenuItem key={team.id} value={String(team.id)}>
                                        {team.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
                    <Button variant="contained" onClick={handleSave}>
                        {t('common.save')}
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
