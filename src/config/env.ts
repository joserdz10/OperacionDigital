import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  telegramToken: required('TELEGRAM_BOT_TOKEN'),
  openaiKey: required('OPENAI_API_KEY'),
  databaseUrl: required('DATABASE_URL'),
  openaiModel: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
  botMode: process.env.BOT_MODE || 'polling',
  port: Number(process.env.PORT || 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
  autoDbInit: (process.env.AUTO_DB_INIT || 'true').toLowerCase() === 'true',
  allowedChatIds: new Set(
    (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .map(Number)
  ),
};
