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
} from '@mui/material'
import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'

interface Team {
    id: number
    name: string
    shortname: string
    captain_id?: number
}

interface PagedResult {
    data: Team[]
    total: number
}

const PAGE_SIZE = 20

export default function Teams() {
    const { t } = useTranslation()
    const { user } = useAuth()
    const navigate = useNavigate()
    const [teams, setTeams] = useState<Team[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(false)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editItem, setEditItem] = useState<Team | null>(null)
    const [form, setForm] = useState({ name: '', shortname: '' })
    const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null)

    const canEdit = user?.roles?.some(r => r === 0 || r === 1)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const offset = (page - 1) * PAGE_SIZE
            const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
            if (search) params.set('q', search)
            const res = await api.get<PagedResult>(`/api/team?${params}`)
            setTeams(res.data ?? [])
            setTotal(res.total ?? 0)
        } catch {
            // ignore
        } finally {
            setLoading(false)
        }
    }, [page, search])

    useEffect(() => {
        load()
    }, [load])

    const openCreate = () => {
        setEditItem(null)
        setForm({ name: '', shortname: '' })
        setDialogOpen(true)
    }

    const openEdit = (team: Team) => {
        setEditItem(team)
        setForm({ name: team.name, shortname: team.shortname })
        setDialogOpen(true)
    }

    const handleSave = async () => {
        try {
            if (editItem) {
                await api.put(`/api/team/${editItem.id}`, form)
            } else {
                await api.post('/api/team', form)
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
            await api.delete(`/api/team/${id}`)
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
                <Typography variant="h5">{t('nav.teams')}</Typography>
                {canEdit && (
                    <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                        {t('team.create')}
                    </Button>
                )}
            </Box>
            <TextField
                size="small"
                label={t('common.search')}
                value={search}
                onChange={e => {
                    setSearch(e.target.value)
                    setPage(1)
                }}
                sx={{ mb: 2, width: 300 }}
            />
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
                    <TableContainer component={Paper}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>{t('team.name')}</TableCell>
                                    <TableCell>{t('team.shortname')}</TableCell>
                                    {canEdit && <TableCell>{t('common.actions')}</TableCell>}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {teams.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={3} align="center">
                                            {t('common.noData')}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    teams.map(row => (
                                        <TableRow
                                            key={row.id}
                                            hover
                                            sx={{ cursor: 'pointer' }}
                                            onClick={() => navigate(`/teams/${row.id}`)}
                                        >
                                            <TableCell>{row.name}</TableCell>
                                            <TableCell>{row.shortname}</TableCell>
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
                <DialogTitle>{editItem ? t('team.edit') : t('team.create')}</DialogTitle>
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
