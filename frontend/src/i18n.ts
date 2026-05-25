import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import pl from './locales/pl.json'

const saved = localStorage.getItem('language') ?? 'pl'

i18n.use(initReactI18next).init({
    resources: { pl: { translation: pl }, en: { translation: en } },
    lng: saved,
    fallbackLng: 'pl',
    interpolation: { escapeValue: false },
})

export default i18n
