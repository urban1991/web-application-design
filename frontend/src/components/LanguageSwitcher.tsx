import { Select, MenuItem, SelectChangeEvent } from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'

export default function LanguageSwitcher() {
    const { i18n } = useTranslation()

    const handleChange = (e: SelectChangeEvent) => {
        const lang = e.target.value
        i18n.changeLanguage(lang)
        localStorage.setItem('language', lang)
        api.put('/api/settings/preferences', { language: lang }).catch(() => {})
    }

    return (
        <Select
            value={i18n.language.startsWith('pl') ? 'pl' : 'en'}
            onChange={handleChange}
            size="medium"
            sx={{
                color: 'inherit',
                '& .MuiSelect-icon': { color: 'inherit' },
            }}
            variant="standard"
            disableUnderline
        >
            <MenuItem value="pl">PL</MenuItem>
            <MenuItem value="en">EN</MenuItem>
        </Select>
    )
}
