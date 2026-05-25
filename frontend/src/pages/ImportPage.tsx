import UploadFileIcon from '@mui/icons-material/UploadFile'
import {
    Box,
    Typography,
    Button,
    Card,
    CardContent,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    CircularProgress,
    Snackbar,
    Alert,
    Divider,
} from '@mui/material'
import React, { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { uploadFile } from '../api/client'

interface PreviewRow {
    [key: string]: string | number | null
}

function ImportSection({ title, endpoint }: { title: string; endpoint: string }) {
    const { t } = useTranslation()
    const fileRef = useRef<HTMLInputElement>(null)
    const [file, setFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<PreviewRow[]>([])
    const [headers, setHeaders] = useState<string[]>([])
    const [loading, setLoading] = useState(false)
    const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null)

    const handleFile = (f: File) => {
        setFile(f)
        const reader = new FileReader()
        reader.onload = e => {
            const text = e.target?.result as string
            if (f.name.endsWith('.json')) {
                try {
                    const data = JSON.parse(text)
                    const rows = Array.isArray(data) ? data : [data]
                    setHeaders(rows.length > 0 ? Object.keys(rows[0]) : [])
                    setPreview(rows.slice(0, 5))
                } catch {
                    setPreview([])
                }
            } else {
                // CSV
                const lines = text.split('\n').filter(Boolean)
                if (lines.length === 0) return
                const hdrs = lines[0].split(',').map(h => h.trim())
                setHeaders(hdrs)
                const rows = lines.slice(1, 6).map(line => {
                    const vals = line.split(',')
                    return Object.fromEntries(hdrs.map((h, i) => [h, vals[i]?.trim() ?? '']))
                })
                setPreview(rows)
            }
        }
        reader.readAsText(f)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        const f = e.dataTransfer.files[0]
        if (f) handleFile(f)
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (f) handleFile(f)
    }

    const handleSubmit = async () => {
        if (!file) return
        setLoading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            await uploadFile(endpoint, formData)
            setSnack({ msg: t('import.success'), sev: 'success' })
            setFile(null)
            setPreview([])
            setHeaders([])
        } catch (err) {
            setSnack({ msg: err instanceof Error ? err.message : t('common.error'), sev: 'error' })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card sx={{ mb: 3 }}>
            <CardContent>
                <Typography
                    variant="h6"
                    sx={{
                        mb: 2,
                    }}
                >
                    {title}
                </Typography>
                <Box
                    onDrop={handleDrop}
                    onDragOver={e => e.preventDefault()}
                    onClick={() => fileRef.current?.click()}
                    sx={{
                        border: '2px dashed',
                        borderColor: 'divider',
                        borderRadius: 1,
                        p: 4,
                        textAlign: 'center',
                        cursor: 'pointer',
                        '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                        mb: 2,
                    }}
                >
                    <UploadFileIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                    <Typography
                        sx={{
                            color: 'text.secondary',
                        }}
                    >
                        {file ? file.name : t('import.dropHere')}
                    </Typography>
                    <Typography
                        variant="caption"
                        sx={{
                            color: 'text.secondary',
                        }}
                    >
                        {t('import.formats')}
                    </Typography>
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".csv,.json"
                        style={{ display: 'none' }}
                        onChange={handleInputChange}
                    />
                </Box>

                {preview.length > 0 && (
                    <>
                        <Typography
                            variant="subtitle2"
                            sx={{
                                mb: 1,
                            }}
                        >
                            {t('import.preview')}
                        </Typography>
                        <TableContainer component={Paper} sx={{ mb: 2 }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        {headers.map(h => (
                                            <TableCell key={h}>{h}</TableCell>
                                        ))}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {preview.map((row, i) => (
                                        <TableRow key={i}>
                                            {headers.map(h => (
                                                <TableCell key={h}>
                                                    {String(row[h] ?? '')}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </>
                )}

                <Button
                    variant="contained"
                    onClick={handleSubmit}
                    disabled={!file || loading}
                    startIcon={loading ? <CircularProgress size={16} /> : <UploadFileIcon />}
                >
                    {t('import.submit')}
                </Button>
            </CardContent>
            <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)}>
                <Alert severity={snack?.sev} onClose={() => setSnack(null)}>
                    {snack?.msg}
                </Alert>
            </Snackbar>
        </Card>
    )
}

export default function ImportPage() {
    const { t } = useTranslation()

    return (
        <Box>
            <Typography
                variant="h5"
                sx={{
                    mb: 3,
                }}
            >
                {t('nav.import')}
            </Typography>
            <ImportSection title={t('import.teams')} endpoint="/api/import/teams" />
            <Divider sx={{ my: 2 }} />
            <ImportSection title={t('import.players')} endpoint="/api/import/players" />
        </Box>
    )
}
