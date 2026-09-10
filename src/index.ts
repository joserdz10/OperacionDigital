import express from 'express';
import { Bot } from 'grammy';
import { env, validateGoogleConfig } from './config/env.js';
import { commandMenu } from './bot/help.js';
import { registerCommands } from './bot/commands.js';
import { db } from './db.js';
import { initializeDatabase } from './services/dbinit.js';
import { completeGoogleOAuth, googleAuthorizationUrl, googleConnectionStatus, verifyGoogleOAuthState } from './services/google-drive.js';

const bot = new Bot(env.telegramToken);

bot.use(async (ctx, next) => {
  if (env.allowedChatIds.size && ctx.chat && !env.allowedChatIds.has(ctx.chat.id)) {
    await ctx.reply('Este bot es privado.');
    return;
  }
  await next();
});

registerCommands(bot);

bot.catch((err) => console.error('Telegram bot error', err.error));

function htmlPage(title: string, body: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#0f1115;color:#f5f5f5;display:grid;place-items:center;min-height:100vh;margin:0}.card{max-width:680px;background:#191c22;border:1px solid #2b3038;border-radius:18px;padding:32px;box-shadow:0 20px 60px #0006}h1{margin-top:0}a{color:#8ab4f8}code{background:#0d0f13;padding:3px 7px;border-radius:6px}</style></head><body><div class="card"><h1>${title}</h1>${body}</div></body></html>`;
}

async function main() {
  if (env.autoDbInit) {
    console.log('Initializing database...');
    await initializeDatabase();
  }
  await db.query('SELECT 1');
  validateGoogleConfig();

  // Required when using bot.handleUpdate() directly in webhook mode.
  await bot.init();
  await bot.api.setMyCommands(commandMenu);

  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.get('/health', async (_req, res) => {
    let drive = { enabled: env.googleDriveEnabled, connected: false } as any;
    try { drive = await googleConnectionStatus(); } catch {}
    res.json({ ok: true, service: 'ai-media-network-operator', version: '0.6.2', google_drive: drive });
  });

  app.get('/google/oauth/start', (_req, res) => {
    if (!env.googleDriveEnabled) return res.status(503).send(htmlPage('Google Drive deshabilitado', '<p>Activa <code>GOOGLE_DRIVE_ENABLED=true</code> en Railway.</p>'));
    try {
      return res.redirect(googleAuthorizationUrl());
    } catch (e: any) {
      return res.status(500).send(htmlPage('No se pudo iniciar OAuth', `<p>${String(e?.message || e)}</p>`));
    }
  });

  app.get('/google/oauth/callback', async (req, res) => {
    const error = typeof req.query.error === 'string' ? req.query.error : '';
    if (error) return res.status(400).send(htmlPage('Autorización cancelada', `<p>Google devolvió: ${error}</p>`));
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !verifyGoogleOAuthState(state)) {
      return res.status(400).send(htmlPage('Solicitud inválida', '<p>El código o el estado de autorización no es válido. Regresa a Telegram y usa <code>/drive</code> de nuevo.</p>'));
    }
    try {
      await completeGoogleOAuth(code);
      return res.send(htmlPage('Google Drive conectado', '<p>✅ AI Media Network ya puede guardar piezas y copies en tu Drive.</p><p>Puedes cerrar esta ventana y regresar a Telegram. Usa <code>/drive</code> para confirmar.</p>'));
    } catch (e: any) {
      console.error('Google OAuth callback failed', e);
      return res.status(500).send(htmlPage('No se pudo conectar Google Drive', `<p>${String(e?.message || e)}</p>`));
    }
  });

  if (env.botMode === 'webhook') {
    if (!env.publicBaseUrl || !env.webhookSecret) throw new Error('PUBLIC_BASE_URL and TELEGRAM_WEBHOOK_SECRET are required in webhook mode.');
    app.post('/telegram/webhook', async (req, res) => {
      const secret = req.header('x-telegram-bot-api-secret-token');
      if (secret !== env.webhookSecret) return res.status(401).send('unauthorized');
      try {
        await bot.handleUpdate(req.body);
        res.sendStatus(200);
      } catch (e) {
        console.error('Webhook update failed', e);
        res.sendStatus(500);
      }
    });
    app.listen(env.port, async () => {
      const url = `${env.publicBaseUrl.replace(/\/$/, '')}/telegram/webhook`;
      await bot.api.setWebhook(url, { secret_token: env.webhookSecret, allowed_updates: ['message','callback_query'] });
      console.log(`Webhook listening on ${url}`);
      if (env.googleDriveEnabled) console.log(`Google OAuth start: ${env.publicBaseUrl.replace(/\/$/, '')}/google/oauth/start`);
    });
  } else {
    app.listen(env.port, () => console.log(`Health server listening on :${env.port}`));
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    console.log('Starting polling mode...');
    await bot.start({ allowed_updates: ['message','callback_query'] });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
