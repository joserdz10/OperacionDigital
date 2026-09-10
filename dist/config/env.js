"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
exports.validateGoogleConfig = validateGoogleConfig;
require("dotenv/config");
function required(name) {
    const value = process.env[name];
    if (!value)
        throw new Error(`Missing required environment variable: ${name}`);
    return value;
}
function optional(name, fallback = '') {
    return process.env[name] || fallback;
}
exports.env = {
    telegramToken: required('TELEGRAM_BOT_TOKEN'),
    openaiKey: required('OPENAI_API_KEY'),
    databaseUrl: required('DATABASE_URL'),
    openaiModel: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
    botMode: process.env.BOT_MODE || 'polling',
    port: Number(process.env.PORT || 3000),
    publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
    autoDbInit: (process.env.AUTO_DB_INIT || 'true').toLowerCase() === 'true',
    allowedChatIds: new Set((process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .map(Number)),
    googleDriveEnabled: (process.env.GOOGLE_DRIVE_ENABLED || 'false').toLowerCase() === 'true',
    googleClientId: optional('GOOGLE_CLIENT_ID'),
    googleClientSecret: optional('GOOGLE_CLIENT_SECRET'),
    googleRedirectUri: optional('GOOGLE_REDIRECT_URI'),
    googleDriveRootFolderId: optional('GOOGLE_DRIVE_ROOT_FOLDER_ID'),
    googleDrivePendingFolderId: optional('GOOGLE_DRIVE_PENDING_FOLDER_ID'),
    googleDrivePublishedFolderId: optional('GOOGLE_DRIVE_PUBLISHED_FOLDER_ID'),
    googleDriveQueueSheetId: optional('GOOGLE_DRIVE_QUEUE_SHEET_ID'),
    googleDriveQueueSheetTab: optional('GOOGLE_DRIVE_QUEUE_SHEET_TAB', 'COLA'),
};
function validateGoogleConfig() {
    if (!exports.env.googleDriveEnabled)
        return;
    const requiredValues = [
        ['GOOGLE_CLIENT_ID', exports.env.googleClientId],
        ['GOOGLE_CLIENT_SECRET', exports.env.googleClientSecret],
        ['GOOGLE_REDIRECT_URI', exports.env.googleRedirectUri],
        ['GOOGLE_DRIVE_ROOT_FOLDER_ID', exports.env.googleDriveRootFolderId],
        ['GOOGLE_DRIVE_PENDING_FOLDER_ID', exports.env.googleDrivePendingFolderId],
        ['GOOGLE_DRIVE_PUBLISHED_FOLDER_ID', exports.env.googleDrivePublishedFolderId],
        ['GOOGLE_DRIVE_QUEUE_SHEET_ID', exports.env.googleDriveQueueSheetId],
    ];
    const missing = requiredValues.filter(([, value]) => !value).map(([name]) => name);
    if (missing.length)
        throw new Error(`Google Drive enabled but missing: ${missing.join(', ')}`);
}
