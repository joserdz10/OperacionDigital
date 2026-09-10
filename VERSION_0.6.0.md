# AI Media Network Operator v0.6.0

## Google Drive Production Queue

- OAuth 2.0 routes: `/google/oauth/start` and `/google/oauth/callback`.
- Telegram `/drive` command shows connection status and authorization link.
- Refresh token stored in PostgreSQL after one-time authorization.
- `/pieza` keeps sending the rendered PNG to Telegram.
- When Drive is connected, `/pieza` also creates/reuses `PENDIENTES/STORY_<id>` and uploads:
  - `story_<id>_<format>.png`
  - `copy_<format>.txt`
  - `info_<format>.json`
- Adds a row to the Google Sheet queue with status `PENDIENTE`.
- Drive failures do not prevent the Telegram piece from being delivered.
- Health endpoint includes Google Drive connection status.

## Required Google APIs

Enable both in the same Google Cloud project:
- Google Drive API
- Google Sheets API

## OAuth scopes

- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/spreadsheets`
