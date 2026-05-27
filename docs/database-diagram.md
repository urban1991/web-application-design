# Diagram bazy danych

```mermaid
erDiagram
    users {
        INTEGER id PK
        TEXT username
        TEXT password_hash
        TEXT roles
        TEXT email
        TEXT mfa_secret
        INTEGER mfa_enabled
        TEXT theme
        TEXT language
    }

    tournaments {
        INTEGER id PK
        TEXT name
        TEXT sport
        DATE start_date
        DATE end_date
        TEXT status
        INTEGER created_by FK
    }

    teams {
        INTEGER id PK
        TEXT name
        TEXT shortname
        INTEGER captain_id FK
    }

    players {
        INTEGER id PK
        TEXT firstname
        TEXT lastname
        TEXT position
        INTEGER team_id FK
    }

    tournament_teams {
        INTEGER id PK
        INTEGER tournament_id FK
        INTEGER team_id FK
        INTEGER seed
    }

    matches {
        INTEGER id PK
        INTEGER tournament_id FK
        INTEGER round
        INTEGER match_number
        INTEGER team1_id FK
        INTEGER team2_id FK
        INTEGER score1
        INTEGER score2
        DATETIME scheduled_at
        TEXT status
        INTEGER winner_id FK
        INTEGER next_match_id FK
    }

    audit_log {
        INTEGER id PK
        TEXT entity
        INTEGER entity_id
        TEXT action
        TEXT old_value
        TEXT new_value
        INTEGER changed_by FK
        DATETIME changed_at
    }

    users ||--o{ tournaments : "tworzy (created_by)"
    users ||--o{ teams : "kapitan (captain_id)"
    teams ||--o{ players : "zawiera"
    tournaments ||--o{ tournament_teams : "dotyczy"
    teams ||--o{ tournament_teams : "uczestniczy"
    tournaments ||--o{ matches : "zawiera"
    teams ||--o{ matches : "team1_id"
    teams ||--o{ matches : "team2_id"
    teams ||--o{ matches : "winner_id"
    matches ||--o{ matches : "next_match_id"
    users ||--o{ audit_log : "changed_by"
```

## Tabele FTS5 (wyszukiwanie pełnotekstowe)

| Tabela wirtualna | Indeksowane kolumny | Tabela źródłowa |
|---|---|---|
| `tournaments_fts` | `name`, `sport` | `tournaments` |
| `teams_fts` | `name`, `shortname` | `teams` |
| `players_fts` | `firstname`, `lastname` | `players` |

Aktualizowane automatycznie przez triggery `AFTER INSERT / UPDATE / DELETE`.

## Role użytkowników

| Wartość | Rola |
|---|---|
| `0` | Administrator |
| `1` | Organizator |
| `2` | Kapitan drużyny |
