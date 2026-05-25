# Frontend — Tournament Management

React + TypeScript + Vite. Klient SPA dla backendu w `../src/`.

---

## Stack

- **React 18** + TypeScript
- **Vite 5** (dev server + production build)
- **MUI v5** (Material UI) — komponenty + motyw light/dark
- **react-router-dom v6** — routing
- **i18next** + react-i18next — wielojęzyczność (PL/EN)
- **chart.js** + react-chartjs-2 — wykresy na dashboardzie
- **@hcaptcha/react-hcaptcha** — widget CAPTCHA
- **qrcode.react** — QR code dla MFA/TOTP

---

## Uruchomienie

```bash
npm install
npm run dev
```

Dev server na **http://localhost:5173**. Vite proxy'uje requesty `/api/*` do backendu na `localhost:4000` (konfiguracja w [`vite.config.ts`](vite.config.ts)). Backend musi być uruchomiony osobno (`cd .. && CAPTCHA_DISABLED=1 npm run dev`).

---

## Build produkcyjny

```bash
npm run build
```

Build trafia do `dist/` i jest serwowany przez backend pod `http://localhost:4000` (SPA fallback w `src/index.ts`).

---

## Struktura

```
src/
├── pages/
│   ├── Login.tsx              # Logowanie + MFA + hCaptcha
│   ├── Dashboard.tsx          # Wykresy + statystyki
│   ├── Tournaments.tsx        # Lista turniejów + FTS + paginacja
│   ├── TournamentDetail.tsx   # Drabinka + tabela wyników + live update (WS)
│   ├── Teams.tsx              # CRUD drużyn
│   ├── Players.tsx            # CRUD zawodników
│   ├── ImportPage.tsx         # Import CSV/JSON (drag-and-drop)
│   ├── Audit.tsx              # Dziennik audytu (admin)
│   └── Settings.tsx           # Preferencje + MFA setup (QR code)
├── components/
│   ├── Layout.tsx             # Drawer + AppBar (responsywny)
│   ├── BracketView.tsx        # Graficzna drabinka turnieju
│   ├── MatchCard.tsx
│   ├── ThemeToggle.tsx        # Przełącznik light/dark
│   └── LanguageSwitcher.tsx   # Przełącznik PL/EN
├── hooks/
│   ├── useAuth.ts             # Kontekst auth + login/logout
│   └── useWebSocket.ts        # Subskrypcja kanału WS
├── api/
│   └── client.ts              # Wrapper fetch z auto CSRF-token
├── locales/
│   ├── pl.json
│   └── en.json
├── theme.ts                   # MUI palette (light/dark)
├── i18n.ts                    # i18next init
├── App.tsx                    # Router + AuthProvider + theme switch
└── main.tsx                   # Entry point
```

---

## Cechy

- **Tryb ciemny/jasny** — `ThemeToggle` w nawigacji, preferencja zapisywana w localStorage i w bazie (`/api/settings/preferences`)
- **Wielojęzyczność PL/EN** — `LanguageSwitcher`, wszystkie etykiety przez `t()`
- **Responsywność** — MUI Drawer (`variant="temporary"` na mobile, `"permanent"` na desktop)
- **Live update** — `useWebSocket` subskrybuje kanał `tournament:{id}`, drabinka i tabela odświeżają się przy aktualizacji wyniku
- **CSRF** — `client.ts` automatycznie czyta cookie `csrf_token` i wstawia header `X-CSRF-Token` do każdego mutującego requesta
