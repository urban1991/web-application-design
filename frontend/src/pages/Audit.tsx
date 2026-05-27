import {
    Box,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Pagination,
    CircularProgress,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
} from '@mui/material'
import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'

interface AuditEntry {
    id: number
    entity: string
    entity_id: number
    action: string
    old_value?: string
    new_value?: string
    username?: string
    changed_at: string
}

interface PagedResult {
    data: AuditEntry[]
    total: number
}

const PAGE_SIZE = 20
const ENTITY_TYPES = ['tournament', 'team', 'player', 'match', 'user']

export default function Audit() {
    const { t } = useTranslation()
    const [entries, setEntries] = useState<AuditEntry[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [entityFilter, setEntityFilter] = useState('')
    const [loading, setLoading] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const offset = (page - 1) * PAGE_SIZE
            const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
            if (entityFilter) params.set('entity', entityFilter)
            const res = await api.get<PagedResult>(`/api/audit?${params}`)
            setEntries(res.data ?? [])
            setTotal(res.total ?? 0)
        } catch {
            // ignore
        } finally {
            setLoading(false)
        }
    }, [page, entityFilter])

    useEffect(() => {
        load()
    }, [load])

    return (
        <Box>
            <Typography
                variant="h5"
                sx={{
                    mb: 2,
                }}
            >
                {t('nav.audit')}
            </Typography>
            <Box
                sx={{
                    mb: 2,
                }}
            >
                <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel>{t('audit.filterByEntity')}</InputLabel>
                    <Select
                        value={entityFilter}
                        label={t('audit.filterByEntity')}
                        onChange={e => {
                            setEntityFilter(e.target.value)
                            setPage(1)
                        }}
                    >
                        <MenuItem value="">{t('audit.all')}</MenuItem>
                        {ENTITY_TYPES.map(e => (
                            <MenuItem key={e} value={e}>
                                {e}
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
                    <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>ID</TableCell>
                                    <TableCell>{t('audit.entity')}</TableCell>
                                    <TableCell>{t('audit.entityId')}</TableCell>
                                    <TableCell>{t('audit.action')}</TableCell>
                                    <TableCell>{t('audit.changedBy')}</TableCell>
                                    <TableCell>{t('audit.changedAt')}</TableCell>
                                    <TableCell>{t('audit.oldValue')}</TableCell>
                                    <TableCell>{t('audit.newValue')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {entries.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center">
                                            {t('common.noData')}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    entries.map(row => (
                                        <TableRow key={row.id}>
                                            <TableCell>{row.id}</TableCell>
                                            <TableCell>{row.entity}</TableCell>
                                            <TableCell>{row.entity_id}</TableCell>
                                            <TableCell>{row.action}</TableCell>
                                            <TableCell>{row.username ?? '-'}</TableCell>
                                            <TableCell>
                                                {new Date(row.changed_at).toLocaleString()}
                                            </TableCell>
                                            <TableCell
                                                sx={{
                                                    maxWidth: 200,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                }}
                                            >
                                                <Typography variant="caption" noWrap>
                                                    {row.old_value ?? '-'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell
                                                sx={{
                                                    maxWidth: 200,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                }}
                                            >
                                                <Typography variant="caption" noWrap>
                                                    {row.new_value ?? '-'}
                                                </Typography>
                                            </TableCell>
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
        </Box>
    )
}
