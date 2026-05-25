import Brightness4Icon from '@mui/icons-material/Brightness4'
import Brightness7Icon from '@mui/icons-material/Brightness7'
import IconButton from '@mui/material/IconButton'
import React from 'react'

interface Props {
    mode: 'light' | 'dark'
    onToggle: () => void
}

export default function ThemeToggle({ mode, onToggle }: Props) {
    return (
        <IconButton color="inherit" onClick={onToggle} aria-label="toggle theme">
            {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
        </IconButton>
    )
}
