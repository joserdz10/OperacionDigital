# Deployment checklist - AI Media Network Operator v0.2

1. Create a private GitHub repository and upload this project.
2. In Railway, create a new project.
3. Add PostgreSQL to the project.
4. Add the bot service from the GitHub repository.
5. In the bot service Variables, add:
   - TELEGRAM_BOT_TOKEN
   - OPENAI_API_KEY
   - DATABASE_URL (reference the PostgreSQL service variable)
   - OPENAI_MODEL=gpt-5.6-luna
   - BOT_MODE=polling
   - PORT=3000
   - AUTO_DB_INIT=true
6. Leave TELEGRAM_ALLOWED_CHAT_IDS empty for the first test only.
7. Deploy. The database will initialize automatically on first boot.
8. In Telegram, send /whoami and copy the chat id returned.
9. Set TELEGRAM_ALLOWED_CHAT_IDS to that id in Railway, then redeploy.
10. Test in Telegram:
   - /estado_actual
   - /corrida 6h
   - /inbox
   - /story <numero>
   - /generar <numero> todo
11. Keep auto-publish OFF.

## Google Drive v0.6.0
- Enable Google Drive API.
- Enable Google Sheets API.
- OAuth client type: Web application.
- Authorized redirect URI must exactly match GOOGLE_REDIRECT_URI.
- If OAuth app is in Testing, add the Google account as a Test User.
- Deploy v0.6.0.
- Telegram: /drive -> authorize -> /drive.
- Test: /pieza <story> story.
