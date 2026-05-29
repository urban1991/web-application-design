# Tournament Management — Zarządzanie turniejami sportowymi

Aplikacja webowa do zarządzania turniejami sportowymi: tworzenie turniejów, zapisy drużyn, generowanie drabinki pucharowej, śledzenie wyników, audyt zmian.

**Temat 9** z listy projektów PAW 2026 — wszystkie wymagania podstawowe i bonusowe zaimplementowane (patrz [§ Funkcje](#funkcje)).

---

## Stack technologiczny

**Backend** (`src/`)
- Node.js 22+ z wbudowanym `node:sqlite` (SQLite z FTS5)
- Express 5 + Passport (sesje + LocalStrategy)
- bcryptjs (hasła), speakeasy (MFA/TOTP)
- nodemailer (powiadomienia mailowe), pdfkit (raporty PDF), ws (WebSocket)
- CSRF: double-submit cookie

**Frontend** (`frontend/`)
- React 18 + TypeScript + Vite
- MUI (Material UI) — komponenty UI + tryb ciemny/jasny
- react-router-dom v6, i18next (PL/EN), chart.js (wykresy na dashboardzie)
- axios (klient HTTP)

**Testy** (`tests/`) — vitest + supertest + better-sqlite3 (shim dla `node:sqlite`).

---

## Wymagania systemowe

- **Node.js 22+** (wymagane dla wbudowanego `node:sqlite`)
- **npm**

Wersję Node przypina plik [`.nvmrc`](.nvmrc):

```bash
nvm use
```

---

## Szybki start

```bash
# 1. zainstaluj zależności backendu + frontendu
npm install
cd frontend && npm install && cd ..

# 2. zainicjuj bazę danych (tworzy data/app.sqlite3 + seeduje 16 drużyn i 4 turnieje)
node tools/createdb.mjs

# 3. uruchom backend (port 4000)
npm run dev

# 4. w drugim terminalu — uruchom frontend dev server (port 5173)
cd frontend && npm run dev
```

Otwórz **http://localhost:5173** i zaloguj się:

| Login | Hasło | Rola |
|---|---|---|
| `admin`   | `Admin123`   | Administrator (0) |
| `user`    | `User123`    | Organizator (1)   |
| `captain` | `Captain123` | Kapitan (2)       |

---

## Tryby uruchamiania

### Tryb deweloperski (z HMR)

- Backend: `npm run dev` — ts-node-dev z restartem na zmianę
- Frontend: `cd frontend && npm run dev` — Vite dev server z hot reload
- Wejście: **http://localhost:5173** (frontend proxy'uje API do `:4000`)

### Tryb produkcyjny (jeden serwer)

```bash
cd frontend && npm run build && cd ..
npm run build         # ts kompilacja backendu do dist/
SESSION_SECRET=... ADMIN_PASSWORD=... USER_PASSWORD=... node dist/index.js
```

Backend serwuje zbudowany SPA z `frontend/dist` na porcie 4000. W produkcji **wymagane są** zmienne środowiskowe `SESSION_SECRET`, `ADMIN_PASSWORD`, `USER_PASSWORD` — bez nich aplikacja się nie wystartuje.

---

## Zmienne środowiskowe

| Zmienna | Wymagana | Opis |
|---|---|---|
| `SESSION_SECRET` | tylko prod | Sekret podpisywania ciasteczek sesji |
| `ADMIN_PASSWORD` | tylko prod | Hasło dla seedowanego konta `admin` |
| `USER_PASSWORD` | tylko prod | Hasło dla seedowanego konta `user` |

| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | nie | Konfiguracja SMTP. Bez tego maile są pomijane bezgłośnie |
| `NODE_ENV` | nie | `production` włącza secure cookies, fail-fast na brak secretów, log-only error messages |

---

## Funkcje

### Wymagania podstawowe
- ✅ Encje: turnieje, drużyny, zawodnicy, mecze
- ✅ Zapisy drużyn do turniejów, przydział zawodników
- ✅ Harmonogram meczów, drabinka pucharowa (single elimination z BYE), tabela wyników
- ✅ Import drużyn i zawodników z CSV/JSON (drag-and-drop)
- ✅ Graficzna drabinka + tabela wyników + raport PDF
- ✅ Trzy role: Administrator, Organizator, Kapitan
- ✅ Audyt zmian (wyniki, składy)
- ✅ Dokumentacja: [diagram bazy](docs/database-diagram.md), [OpenAPI 3.0](docs/api-spec.yaml)

### Wymagania bonusowe
- ✅ **FTS5** — wyszukiwanie pełnotekstowe dla turniejów, drużyn, zawodników (z sanityzacją input)
- ✅ **Wykresy** — chart.js na dashboardzie (turnieje wg statusu, statystyki)
- ✅ **Paginacja** serwerowa z limit/offset dla dużych zbiorów
- ✅ **WebSockets** — live update wyników i drabinki (kanał `tournament:{id}`)
- ✅ **MFA/TOTP** — speakeasy + QR code; **CSRF** — double-submit cookie
- ✅ **Tryb ciemny/jasny** z zapisem preferencji w bazie i localStorage
- ✅ **Responsywność** — MUI Drawer (hamburger na mobile, permanent na desktop)
- ✅ **Powiadomienia mailowe** — przy zapisie do turnieju, generacji drabinki, aktualizacji wyniku (z rate-limit per recipient)
- ✅ **Wielojęzyczność** — i18next, PL/EN
- ✅ **Testy automatyczne** — 33 przypadki testowe (vitest + supertest)

---

## Testy

```bash
npm test                  # uruchamia wszystkie testy
```

Aktualnie: **33 testy** w 3 plikach pokrywają CRUD turniejów, generację drabinki, advanceWinner, import CSV/JSON, FTS, paginację, audit log.

---

## Struktura projektu

```
.
├── src/                  # Backend (TypeScript)
│   ├── index.ts          # Bootstrap Express, sesje, CSRF, SPA fallback
│   ├── auth.ts           # Passport LocalStrategy + requireAuth
│   ├── bracket.ts        # generateBracket + advanceWinner
│   ├── websocket.ts      # PubSub na kanałach
│   ├── email.ts          # nodemailer + escapeHtml + rate limit
│   ├── pdf.ts            # Raport PDF turnieju
│   ├── auditlog.ts       # writeAudit()
│   ├── fts.ts            # sanitizeFtsQuery()
│   └── api/              # Routery: tournament, team, player, match, import, audit, settings, auth
├── frontend/             # React + Vite + MUI
│   ├── src/
│   │   ├── pages/        # Dashboard, Tournaments, TournamentDetail, Teams, Players, Import, Audit, Settings, Login
│   │   ├── components/   # BracketView, MatchCard, Layout, ThemeToggle, LanguageSwitcher
│   │   ├── hooks/        # useAuth, useWebSocket
│   │   ├── api/          # client.ts (z auto CSRF)
│   │   ├── locales/      # pl.json, en.json
│   │   ├── theme.ts      # MUI motyw (light/dark)
│   │   └── i18n.ts       # i18next config
├── tests/                # vitest + supertest + better-sqlite3 shim
├── tools/createdb.mjs    # Inicjalizacja schematu + seed
├── docs/
│   ├── database-diagram.md   # ER diagram (Mermaid)
│   └── api-spec.yaml         # OpenAPI 3.0
└── data/app.sqlite3      # Baza SQLite (gitignored)
```

---

## Bezpieczeństwo

Zaimplementowane:
- Hasła w bcrypt (cost 10), MFA TOTP (speakeasy)
- Sesje na cookies z `httpOnly`, `secure` (prod), `sameSite: 'lax'`
- CSRF: double-submit cookie (`csrf_token` + `X-CSRF-Token`)
- Eskejpowanie HTML w wychodzących mailach
- Sanityzacja zapytań FTS5
- Walidacja typu pliku przez sniffing (nie tylko mimetype)
- Mass-assignment protection: `id` z URL, `created_by` z sesji
- Foreign keys + transakcje na operacjach krytycznych (aktualizacja wyniku, generacja drabinki)
- Error handler ukrywa szczegóły w produkcji

---

## API i baza danych

- **OpenAPI 3.0**: [`docs/api-spec.yaml`](docs/api-spec.yaml) — wklej do https://editor.swagger.io aby zobaczyć interaktywną dokumentację
- **Diagram ER**: [`docs/database-diagram.md`](docs/database-diagram.md) — diagram Mermaid

---

## Licencja i kontekst

Projekt zaliczeniowy z przedmiotu *Programowanie Aplikacji Webowych* (PAW 2026).
