import express from 'express';
import { Bot } from 'grammy';
import { env } from './config/env.js';
import { commandMenu } from './bot/help.js';
import { registerCommands } from './bot/commands.js';
import { db } from './db.js';
import { initializeDatabase } from './services/dbinit.js';

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

async function main() {
  if (env.autoDbInit) {
    console.log('Initializing database...');
    await initializeDatabase();
  }
  await db.query('SELECT 1');
  await bot.api.setMyCommands(commandMenu);

  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'ai-media-network-operator', version: '0.1.0' }));

  if (env.botMode === 'webhook') {
    if (!env.publicBaseUrl || !env.webhookSecret) throw new Error('PUBLIC_BASE_URL and TELEGRAM_WEBHOOK_SECRET are required in webhook mode.');
    app.post('/telegram/webhook', async (req, res) => {
      const secret = req.header('x-telegram-bot-api-secret-token');
      if (secret !== env.webhookSecret) return res.status(401).send('unauthorized');
      try {
        await bot.handleUpdate(req.body);
        res.sendStatus(200);
      } catch (e) {
        console.error(e);
        res.sendStatus(500);
      }
    });
    app.listen(env.port, async () => {
      const url = `${env.publicBaseUrl.replace(/\/$/, '')}/telegram/webhook`;
      await bot.api.setWebhook(url, { secret_token: env.webhookSecret, allowed_updates: ['message','callback_query'] });
      console.log(`Webhook listening on ${url}`);
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
