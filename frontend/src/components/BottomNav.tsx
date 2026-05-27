import DashboardIcon from '@mui/icons-material/Dashboard'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import GroupsIcon from '@mui/icons-material/Groups'
import PersonIcon from '@mui/icons-material/Person'
import { BottomNavigation, BottomNavigationAction, Paper } from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'

const PATHS = ['/', '/tournaments', '/teams', '/players']

export default function BottomNav() {
    const { t } = useTranslation()
    const location = useLocation()
    const navigate = useNavigate()

    const value = PATHS.findIndex(p =>
        p === '/' ? location.pathname === '/' : location.pathname.startsWith(p)
    )

    return (
        <Paper
            sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: theme => theme.zIndex.appBar }}
            elevation={3}
        >
            <BottomNavigation
                value={value === -1 ? false : value}
                onChange={(_, newValue: number) => navigate(PATHS[newValue])}
            >
                <BottomNavigationAction label={t('nav.dashboard')} icon={<DashboardIcon />} />
                <BottomNavigationAction label={t('nav.tournaments')} icon={<EmojiEventsIcon />} />
                <BottomNavigationAction label={t('nav.teams')} icon={<GroupsIcon />} />
                <BottomNavigationAction label={t('nav.players')} icon={<PersonIcon />} />
            </BottomNavigation>
        </Paper>
    )
}
