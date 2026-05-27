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
    MenuItem,
    Select,
    FormControl,
    InputLabel,
    Chip,
    Pagination,
    CircularProgress,
    Snackbar,
    Alert,
    Card,
    CardContent,
    Stack,
    useTheme,
    useMediaQuery,
} from '@mui/material'
import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'

interface Tournament {
    id: number
    name: string
    sport: string
    start_date: string
    end_date: string
    status: string
}

interface PagedResult {
    data: Tournament[]
    total: number
}

const PAGE_SIZE = 20

interface TournamentCardProps {
    row: Tournament
    canEdit: boolean
    statusColor: (s: string) => 'success' | 'default' | 'warning'
    onEdit: () => void
    onDelete: () => void
    onClick: () => void
}

function TournamentCard({ row, canEdit, statusColor, onEdit, onDelete, onClick }: TournamentCardProps) {
    return (
        <Card variant="outlined" sx={{ mb: 1, cursor: 'pointer' }} onClick={onClick}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1, mr: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                            {row.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {row.sport}
                        </Typography>
                        {row.start_date && (
                            <Typography variant="caption" color="text.secondary">
                                {row.start_date.split('T')[0]}
                                {row.end_date ? ` – ${row.end_date.split('T')[0]}` : ''}
                            </Typography>
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                        <Chip label={row.status} color={statusColor(row.status)} size="small" />
                        {canEdit && (
                            <Box onClick={e => e.stopPropagation()}>
                                <IconButton size="small" onClick={onEdit}>
                                    <EditIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" color="error" onClick={onDelete}>
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </Box>
                        )}
                    </Box>
                </Box>
            </CardContent>
        </Card>
    )
}

export default function Tournaments() {
    const { t } = useTranslation()
    const { user } = useAuth()
    const navigate = useNavigate()
    const [tournaments, setTournaments] = useState<Tournament[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState('')
    const [loading, setLoading] = useState(false)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editItem, setEditItem] = useState<Tournament | null>(null)
    const [form, setForm] = useState({
        name: '',
        sport: '',
        start_date: '',
        end_date: '',
        status: 'draft',
    })
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
            if (filter) params.set('filter', filter)
            const res = await api.get<PagedResult>(`/api/tournament?${params}`)
            setTournaments(res.data ?? [])
            setTotal(res.total ?? 0)
        } catch {
            // ignore
        } finally {
            setLoading(false)
        }
    }, [page, search, filter])

    useEffect(() => {
        load()
    }, [load])

    const openCreate = () => {
        setEditItem(null)
        setForm({ name: '', sport: '', start_date: '', end_date: '', status: 'draft' })
        setDialogOpen(true)
    }

    const openEdit = (t: Tournament) => {
        setEditItem(t)
        setForm({
            name: t.name,
            sport: t.sport,
            start_date: t.start_date,
            end_date: t.end_date,
            status: t.status,
        })
        setDialogOpen(true)
    }

    const handleSave = async () => {
        try {
            if (editItem) {
                await api.put(`/api/tournament/${editItem.id}`, form)
            } else {
                await api.post('/api/tournament', form)
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
            await api.delete(`/api/tournament/${id}`)
            setSnack({ msg: t('common.success'), sev: 'success' })
            load()
        } catch (err) {
            setSnack({ msg: err instanceof Error ? err.message : t('common.error'), sev: 'error' })
        }
    }

    const statusColor = (status: string) => {
        if (status === 'active') return 'success'
        if (status === 'finished') return 'default'
        return 'warning'
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
                <Typography variant="h5">{t('nav.tournaments')}</Typography>
                {canEdit && (
                    <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                        {t('tournament.create')}
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
                <TextField
                    size="small"
                    label={t('common.filter')}
                    value={filter}
                    onChange={e => {
                        setFilter(e.target.value)
                        setPage(1)
                    }}
                    sx={{ flex: 1 }}
                />
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
                            {tournaments.length === 0 ? (
                                <Typography sx={{ color: 'text.secondary', textAlign: 'center', mt: 2 }}>
                                    {t('common.noData')}
                                </Typography>
                            ) : (
                                tournaments.map(row => (
                                    <TournamentCard
                                        key={row.id}
                                        row={row}
                                        canEdit={!!canEdit}
                                        statusColor={statusColor}
                                        onEdit={() => openEdit(row)}
                                        onDelete={() => handleDelete(row.id)}
                                        onClick={() => navigate(`/tournaments/${row.id}`)}
                                    />
                                ))
                            )}
                        </Stack>
                    ) : (
                        <TableContainer component={Paper}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t('tournament.name')}</TableCell>
                                        <TableCell>{t('tournament.sport')}</TableCell>
                                        <TableCell>{t('tournament.startDate')}</TableCell>
                                        <TableCell>{t('tournament.endDate')}</TableCell>
                                        <TableCell>{t('tournament.status')}</TableCell>
                                        {canEdit && <TableCell>{t('common.actions')}</TableCell>}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {tournaments.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} align="center">
                                                {t('common.noData')}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        tournaments.map(row => (
                                            <TableRow
                                                key={row.id}
                                                hover
                                                sx={{ cursor: 'pointer' }}
                                                onClick={() => navigate(`/tournaments/${row.id}`)}
                                            >
                                                <TableCell>{row.name}</TableCell>
                                                <TableCell>{row.sport}</TableCell>
                                                <TableCell>{row.start_date?.split('T')[0]}</TableCell>
                                                <TableCell>{row.end_date?.split('T')[0]}</TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={
                                                            t(`tournament.${row.status}`) || row.status
                                                        }
                                                        color={
                                                            statusColor(row.status) as
                                                                | 'success'
                                                                | 'default'
                                                                | 'warning'
                                                        }
                                                        size="small"
                                                    />
                                                </TableCell>
                                                {canEdit && (
                                                    <TableCell onClick={e => e.stopPropagation()}>
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
                <DialogTitle>
                    {editItem ? t('tournament.edit') : t('tournament.create')}
                </DialogTitle>
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
                            label={t('tournament.name')}
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                            fullWidth
                        />
                        <TextField
                            label={t('tournament.sport')}
                            value={form.sport}
                            onChange={e => setForm({ ...form, sport: e.target.value })}
                            fullWidth
                        />
                        <TextField
                            label={t('tournament.startDate')}
                            type="date"
                            value={form.start_date}
                            onChange={e => setForm({ ...form, start_date: e.target.value })}
                            fullWidth
                            slotProps={{ inputLabel: { shrink: true } }}
                        />
                        <TextField
                            label={t('tournament.endDate')}
                            type="date"
                            value={form.end_date}
                            onChange={e => setForm({ ...form, end_date: e.target.value })}
                            fullWidth
                            slotProps={{ inputLabel: { shrink: true } }}
                        />
                        <FormControl fullWidth>
                            <InputLabel>{t('tournament.status')}</InputLabel>
                            <Select
                                value={form.status}
                                label={t('tournament.status')}
                                onChange={e => setForm({ ...form, status: e.target.value })}
                            >
                                <MenuItem value="draft">{t('tournament.draft')}</MenuItem>
                                <MenuItem value="active">{t('tournament.active')}</MenuItem>
                                <MenuItem value="finished">{t('tournament.finished')}</MenuItem>
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
