# AI Media Network Operator v0.1 — Telegram MVP

Telegram is the provisional conversational control center for AI Media Network. The architecture is national/multi-state from day one: one Shared Brain, a National Brain, and 32 configurable State Brains. Nuevo Leon is only the first active seed.

## What works in v0.1

- 32 State Brains seeded; Nuevo Leon active.
- Nuevo Leon identities seeded; Norte En Alerta active.
- Norte En Alerta Media DNA + Visual DNA metadata.
- Nuevo Leon Topics, including `NL-T25 Proceso Electoral Nuevo Leon 2026-2027`.
- Profiles and official source pack.
- Telegram command menu.
- `/corrida` uses the OpenAI Responses API with web search to discover current stories.
- Story Inbox persisted in PostgreSQL.
- `/story` shows topics, profiles, sources and claims.
- `/generar` creates a content bundle from the stored fact pack.
- `/elecciones`, `/topic`, `/profile`, `/watch`, `/fuentes`, `/ready`.
- Polling mode for fastest first deployment and webhook mode for production.
- Auto-publish is intentionally OFF.

## Not in this phase

Per project scope: analytics, advertising, users/RBAC, billing and campaigns are not built yet. Automatic visual rendering is also not in v0.1; `/pieza` returns the approved template specification after `/generar`.

## 1. Create PostgreSQL

Create a PostgreSQL database in Railway (or another provider), then copy its `DATABASE_URL`.

## 2. Environment variables

Copy `.env.example` to `.env` locally, or add the variables directly in Railway:

```env
TELEGRAM_BOT_TOKEN=YOUR_SECRET_TOKEN
OPENAI_API_KEY=YOUR_OPENAI_KEY
DATABASE_URL=postgresql://...
OPENAI_MODEL=gpt-5.6-luna
BOT_MODE=polling
PORT=3000
AUTO_DB_INIT=true

# Strongly recommended: restrict the bot to your Telegram chat id.
TELEGRAM_ALLOWED_CHAT_IDS=123456789
```

Never commit or paste real tokens into source code.

## 3. Initialize the database

By default `AUTO_DB_INIT=true`, so the service initializes and seeds PostgreSQL on first start. You do not need `psql` in Railway.

The seed creates:

- National Brain
- 32 State Brains
- Nuevo Leon active
- Norte En Alerta active
- five additional Nuevo Leon identities in setup/draft state
- topics/profiles/sources for Nuevo Leon

## 4. Run locally

```bash
npm run dev
```

Telegram polling is the easiest way to validate the first deployment.

## 5. Deploy to Railway

1. Put this repository in GitHub or deploy the folder with Railway CLI.
2. Create a Railway project.
3. Add PostgreSQL.
4. Add the environment variables above.
5. Deploy the bot service using the included Dockerfile.
6. Initialize the DB once with the SQL files (or run `npm run db:init` from Railway shell).
7. Open Telegram and send `/estado_actual`, then `/corrida 6h`.

## Webhook mode (after polling works)

Set:

```env
BOT_MODE=webhook
PUBLIC_BASE_URL=https://YOUR-RAILWAY-DOMAIN
TELEGRAM_WEBHOOK_SECRET=A_RANDOM_SECRET
```

The app registers `/telegram/webhook` automatically and validates Telegram's secret header.

## First operational commands

```text
/whoami
/estado_actual
/corrida 6h
/inbox
/story 1
/generar 1 todo
/elecciones
/topic Agua
/profile Samuel Garcia
/watch Metro Linea 6
/fuentes
/ready
```

## Architecture rule

No code should be written specifically for Nuevo Leon. State-specific behavior belongs in configuration/seed data keyed by `territory_brain_id`, and identity-specific behavior belongs in Media DNA / Visual DNA keyed by `identity_id`.

## Security

- Treat `TELEGRAM_BOT_TOKEN` and `OPENAI_API_KEY` as secrets.
- Use `TELEGRAM_ALLOWED_CHAT_IDS` while the bot is private.
- Do not enable automatic publishing in this MVP.
- Rotate a Telegram token immediately if it is ever exposed.


## v0.5.1
- Instala `libwebp-tools` en Railway para decodificar imágenes WebP (`dwebp`).
- Decodifica WebP explícitamente antes del render.
- Corrige la invocación de ImageMagick 7 para evitar `magick convert`.

## v0.5.2
- Integra los assets oficiales de Norte En Alerta: logotipo completo e isotipo.
- Fija canvases por tipo de pieza: FB/IG 1080x1350, Story/Reel 1080x1920, Square 1080x1080.
- Usa plantillas independientes por formato y zonas seguras específicas.
- Story/Reel: foto full bleed, logotipo oficial superior, kicker territorial/editorial, titular, bajada, fuente e isotipo.
- Feed: header editorial con logotipo oficial, foto, kicker, titular, bajada, fuente y footer compacto.
- Corrige etiquetas duplicadas como `NUEVO LEÓN | NUEVO LEÓN`; ahora intenta usar municipio + sección, por ejemplo `APODACA | SEGURIDAD`.
- Mantiene compatibilidad con Stories ya generadas: si `location` o `section` no existen en la spec, el renderer los infiere del Story.
