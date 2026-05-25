import { Box, Card, CardContent, Typography, Grid, CircularProgress, Alert } from '@mui/material'
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js'
import React, { useEffect, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

interface PagedResult<T> {
    data: T[]
    total: number
}

interface Tournament {
    id: number
    status: string
}

export default function Dashboard() {
    const { t } = useTranslation()
    const [stats, setStats] = useState({
        totalTournaments: 0,
        totalTeams: 0,
        totalPlayers: 0,
        activeTournaments: 0,
    })
    const [statusCounts, setStatusCounts] = useState({ draft: 0, active: 0, finished: 0 })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const [tRes, teamRes, playerRes, allTRes] = await Promise.all([
                    api.get<PagedResult<Tournament>>('/api/tournament?limit=1'),
                    api.get<PagedResult<unknown>>('/api/team?limit=1'),
                    api.get<PagedResult<unknown>>('/api/player?limit=1'),
                    api.get<PagedResult<Tournament>>('/api/tournament?limit=100'),
                ])

                const tournaments = allTRes.data ?? []
                const draft = tournaments.filter(t => t.status === 'draft').length
                const active = tournaments.filter(t => t.status === 'active').length
                const finished = tournaments.filter(t => t.status === 'finished').length

                setStats({
                    totalTournaments: tRes.total ?? 0,
                    totalTeams: teamRes.total ?? 0,
                    totalPlayers: playerRes.total ?? 0,
                    activeTournaments: active,
                })
                setStatusCounts({ draft, active, finished })
            } catch (err) {
                setError(err instanceof Error ? err.message : t('common.error'))
            } finally {
                setLoading(false)
            }
        }
        fetchStats()
    }, [t])

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

    const chartData = {
        labels: [t('tournament.draft'), t('tournament.active'), t('tournament.finished')],
        datasets: [
            {
                label: t('dashboard.tournamentsByStatus'),
                data: [statusCounts.draft, statusCounts.active, statusCounts.finished],
                backgroundColor: ['#1976d2', '#2e7d32', '#ed6c02'],
            },
        ],
    }

    const statCards = [
        { label: t('dashboard.totalTournaments'), value: stats.totalTournaments, color: '#1976d2' },
        { label: t('dashboard.totalTeams'), value: stats.totalTeams, color: '#7b1fa2' },
        { label: t('dashboard.totalPlayers'), value: stats.totalPlayers, color: '#388e3c' },
        {
            label: t('dashboard.activeTournaments'),
            value: stats.activeTournaments,
            color: '#f57c00',
        },
    ]

    return (
        <Box>
            <Typography
                variant="h4"
                sx={{
                    mb: 3,
                }}
            >
                {t('dashboard.title')}
            </Typography>
            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                </Alert>
            )}
            <Grid
                container
                spacing={3}
                sx={{
                    mb: 4,
                }}
            >
                {statCards.map(card => (
                    <Grid size={{ xs: 12, sm: 6, md: 3 }} key={card.label}>
                        <Card>
                            <CardContent>
                                <Typography
                                    variant="h3"
                                    color={card.color}
                                    sx={{
                                        fontWeight: 'bold',
                                    }}
                                >
                                    {card.value}
                                </Typography>
                                <Typography
                                    variant="body1"
                                    sx={{
                                        color: 'text.secondary',
                                    }}
                                >
                                    {card.label}
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>
            <Card>
                <CardContent>
                    <Typography
                        variant="h6"
                        sx={{
                            mb: 2,
                        }}
                    >
                        {t('dashboard.tournamentsByStatus')}
                    </Typography>
                    <Box
                        sx={{
                            maxWidth: 500,
                        }}
                    >
                        <Bar
                            data={chartData}
                            options={{ responsive: true, plugins: { legend: { display: false } } }}
                        />
                    </Box>
                </CardContent>
            </Card>
        </Box>
    )
}
