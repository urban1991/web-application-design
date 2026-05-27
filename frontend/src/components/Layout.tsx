import DashboardIcon from '@mui/icons-material/Dashboard'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import GroupsIcon from '@mui/icons-material/Groups'
import HistoryIcon from '@mui/icons-material/History'
import LogoutIcon from '@mui/icons-material/Logout'
import MenuIcon from '@mui/icons-material/Menu'
import PersonIcon from '@mui/icons-material/Person'
import SettingsIcon from '@mui/icons-material/Settings'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import {
    AppBar,
    Box,
    CssBaseline,
    Divider,
    Drawer,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Toolbar,
    Typography,
    Button,
    useTheme,
    useMediaQuery,
} from '@mui/material'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import BottomNav from './BottomNav'
import LanguageSwitcher from './LanguageSwitcher'
import ThemeToggle from './ThemeToggle'
import { useAuth } from '../hooks/useAuth'

const DRAWER_WIDTH = 240

interface Props {
    themeMode: 'light' | 'dark'
    onToggleTheme: () => void
}

export default function Layout({ themeMode, onToggleTheme }: Props) {
    const { t } = useTranslation()
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const [mobileOpen, setMobileOpen] = useState(false)
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

    const isAdmin = user?.roles?.includes(0)
    const isOrganizerOrAdmin = user?.roles?.some(r => r === 0 || r === 1)

    const navItems = [
        { label: t('nav.dashboard'), icon: <DashboardIcon />, path: '/', show: true },
        {
            label: t('nav.tournaments'),
            icon: <EmojiEventsIcon />,
            path: '/tournaments',
            show: true,
        },
        { label: t('nav.teams'), icon: <GroupsIcon />, path: '/teams', show: true },
        { label: t('nav.players'), icon: <PersonIcon />, path: '/players', show: true },
        {
            label: t('nav.import'),
            icon: <UploadFileIcon />,
            path: '/import',
            show: isOrganizerOrAdmin,
        },
        { label: t('nav.audit'), icon: <HistoryIcon />, path: '/audit', show: isAdmin },
        { label: t('nav.settings'), icon: <SettingsIcon />, path: '/settings', show: true },
    ]

    const handleLogout = async () => {
        await logout()
        navigate('/login')
    }

    const drawer = (
        <Box>
            <Toolbar>
                <Typography variant="h6" noWrap>
                    Turnieje
                </Typography>
            </Toolbar>
            <Divider />
            <List>
                {navItems
                    .filter(item => item.show)
                    .map(item => (
                        <ListItem key={item.path} disablePadding>
                            <ListItemButton
                                selected={location.pathname === item.path}
                                onClick={() => {
                                    navigate(item.path)
                                    setMobileOpen(false)
                                }}
                            >
                                <ListItemIcon>{item.icon}</ListItemIcon>
                                <ListItemText primary={item.label} />
                            </ListItemButton>
                        </ListItem>
                    ))}
            </List>
            <Divider />
            <List>
                <ListItem disablePadding>
                    <ListItemButton onClick={handleLogout}>
                        <ListItemIcon>
                            <LogoutIcon />
                        </ListItemIcon>
                        <ListItemText primary={t('nav.logout')} />
                    </ListItemButton>
                </ListItem>
            </List>
        </Box>
    )

    return (
        <Box sx={{ display: 'flex' }}>
            <CssBaseline />
            <AppBar position="fixed" sx={{ zIndex: theme => theme.zIndex.drawer + 1 }}>
                <Toolbar>
                    <IconButton
                        color="inherit"
                        edge="start"
                        onClick={() => setMobileOpen(!mobileOpen)}
                        sx={{ mr: 2, display: { sm: 'none' } }}
                    >
                        <MenuIcon />
                    </IconButton>
                    <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
                        Tournament Manager
                    </Typography>
                    <Typography variant="body2" sx={{ mr: 2 }}>
                        {user?.username}
                    </Typography>
                    <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center' }}>
                        <LanguageSwitcher />
                        <ThemeToggle mode={themeMode} onToggle={onToggleTheme} />
                    </Box>
                    <Button
                        color="inherit"
                        onClick={handleLogout}
                        startIcon={<LogoutIcon />}
                        sx={{ display: { xs: 'none', sm: 'flex' } }}
                    >
                        {t('nav.logout')}
                    </Button>
                </Toolbar>
            </AppBar>

            <Box component="nav" sx={{ width: { sm: DRAWER_WIDTH }, flexShrink: { sm: 0 } }}>
                <Drawer
                    variant="temporary"
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    ModalProps={{ keepMounted: true }}
                    sx={{
                        display: { xs: 'block', sm: 'none' },
                        '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH },
                    }}
                >
                    {drawer}
                </Drawer>
                <Drawer
                    variant="permanent"
                    sx={{
                        display: { xs: 'none', sm: 'block' },
                        '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH },
                    }}
                    open
                >
                    {drawer}
                </Drawer>
            </Box>

            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    minWidth: 0,
                    p: 3,
                    width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
                    mt: '64px',
                    pb: { xs: 9, sm: 3 },
                }}
            >
                <Outlet />
            </Box>
            {isMobile && <BottomNav />}
        </Box>
    )
}
