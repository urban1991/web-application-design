import { Box, Typography } from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'
import MatchCard from './MatchCard'

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
    matches: Match[]
    onUpdate?: () => void
}

export default function BracketView({ matches, onUpdate }: Props) {
    const { t } = useTranslation()

    if (!matches || matches.length === 0) {
        return (
            <Typography
                sx={{
                    color: 'text.secondary',
                }}
            >
                {t('common.noData')}
            </Typography>
        )
    }

    const rounds = Array.from(new Set(matches.map(m => m.round))).sort((a, b) => a - b)

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'row',
                gap: 4,
                overflowX: 'auto',
                p: 2,
                alignItems: 'stretch',
            }}
        >
            {rounds.map(round => {
                const roundMatches = matches
                    .filter(m => m.round === round)
                    .sort((a, b) => a.match_number - b.match_number)

                return (
                    <Box
                        key={round}
                        sx={{ display: 'flex', flexDirection: 'column', minWidth: 180 }}
                    >
                        <Typography
                            variant="subtitle2"
                            sx={{
                                textAlign: 'center',
                                mb: 1,
                                fontWeight: 'bold',
                            }}
                        >
                            {t('match.round')} {round}
                        </Typography>
                        <Box
                            sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 2,
                                justifyContent: 'center',
                                flex: 1,
                            }}
                        >
                            {roundMatches.map(match => (
                                <MatchCard key={match.id} match={match} onUpdate={onUpdate} />
                            ))}
                        </Box>
                    </Box>
                )
            })}
        </Box>
    )
}
