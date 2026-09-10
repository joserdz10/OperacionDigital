import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { one, query } from '../db.js';
import { storyDetail } from './stories.js';

type TokenRow = {
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | Date | null;
  scope: string | null;
  metadata: any;
};

type DriveFile = {
  id: string;
  name: string;
  webViewLink?: string;
  mimeType?: string;
};

export type ProductionSaveResult = {
  folderId: string;
  folderUrl: string;
  pieceFile: DriveFile;
  copyFile: DriveFile;
  metadataFile: DriveFile;
  queueUpdated: boolean;
  queueError?: string;
};

export type ProductionPublishResult = {
  folderId: string;
  folderUrl: string;
  queueUpdated: boolean;
  queueError?: string;
  publishedAt: Date;
};

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
];

function stateKey() {
  return env.webhookSecret || env.googleClientSecret;
}

function b64url(input: string) {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function unb64url(input: string) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(value: string) {
  return createHmac('sha256', stateKey()).update(value).digest('base64url');
}

export function makeGoogleOAuthState() {
  const payload = JSON.stringify({ ts: Date.now(), nonce: Math.random().toString(36).slice(2) });
  const encoded = b64url(payload);
  return `${encoded}.${sign(encoded)}`;
}

export function verifyGoogleOAuthState(state: string) {
  const [encoded, signature] = String(state || '').split('.');
  if (!encoded || !signature) return false;
  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(unb64url(encoded));
    return typeof payload.ts === 'number' && Date.now() - payload.ts < 15 * 60 * 1000;
  } catch {
    return false;
  }
}

export function googleAuthorizationUrl() {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleRedirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: GOOGLE_SCOPES.join(' '),
    state: makeGoogleOAuthState(),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeAuthorizationCode(code: string) {
  const body = new URLSearchParams({
    code,
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    redirect_uri: env.googleRedirectUri,
    grant_type: 'authorization_code',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data: any = await response.json();
  if (!response.ok) throw new Error(data?.error_description || data?.error || `OAuth token exchange failed (${response.status})`);
  return data;
}

export async function completeGoogleOAuth(code: string) {
  const token = await exchangeAuthorizationCode(code);
  const existing = await one<TokenRow>(`SELECT * FROM integration_tokens WHERE provider='google_drive'`);
  const refreshToken = token.refresh_token || existing?.refresh_token;
  if (!refreshToken) throw new Error('Google did not return a refresh token. Re-authorize with consent.');
  const expiresAt = new Date(Date.now() + Number(token.expires_in || 3600) * 1000);
  await query(
    `INSERT INTO integration_tokens(provider,access_token,refresh_token,expires_at,scope,metadata,updated_at)
     VALUES('google_drive',$1,$2,$3,$4,$5::jsonb,now())
     ON CONFLICT(provider) DO UPDATE SET
       access_token=EXCLUDED.access_token,
       refresh_token=EXCLUDED.refresh_token,
       expires_at=EXCLUDED.expires_at,
       scope=EXCLUDED.scope,
       metadata=EXCLUDED.metadata,
       updated_at=now()`,
    [token.access_token || null, refreshToken, expiresAt, token.scope || GOOGLE_SCOPES.join(' '), JSON.stringify({ token_type: token.token_type || 'Bearer' })]
  );
  return { connected: true, scope: token.scope || GOOGLE_SCOPES.join(' ') };
}

export async function googleConnectionStatus() {
  if (!env.googleDriveEnabled) return { enabled: false, connected: false };
  const token = await one<TokenRow>(`SELECT * FROM integration_tokens WHERE provider='google_drive'`);
  return {
    enabled: true,
    connected: Boolean(token?.refresh_token),
    expiresAt: token?.expires_at || null,
    scope: token?.scope || null,
  };
}

async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data: any = await response.json();
  if (!response.ok) throw new Error(data?.error_description || data?.error || `Google token refresh failed (${response.status})`);
  const expiresAt = new Date(Date.now() + Number(data.expires_in || 3600) * 1000);
  await query(
    `UPDATE integration_tokens SET access_token=$1,expires_at=$2,scope=COALESCE($3,scope),updated_at=now() WHERE provider='google_drive'`,
    [data.access_token, expiresAt, data.scope || null]
  );
  return data.access_token as string;
}

async function accessToken() {
  const token = await one<TokenRow>(`SELECT * FROM integration_tokens WHERE provider='google_drive'`);
  if (!token?.refresh_token) throw new Error('Google Drive is not authorized. Open /drive in Telegram and connect Google.');
  const expires = token.expires_at ? new Date(token.expires_at).getTime() : 0;
  if (token.access_token && expires > Date.now() + 60_000) return token.access_token;
  return refreshAccessToken(token.refresh_token);
}

async function googleJson(url: string, init: RequestInit = {}) {
  const token = await accessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const message = data?.error?.message || data?.error_description || `Google API error ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function driveApi(path: string) {
  return `https://www.googleapis.com/drive/v3${path}`;
}

function uploadApi(path: string) {
  return `https://www.googleapis.com/upload/drive/v3${path}`;
}

function sheetsApi(path: string) {
  return `https://sheets.googleapis.com/v4${path}`;
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findChildFolder(parentId: string, name: string): Promise<DriveFile | null> {
  const q = `'${escapeDriveQuery(parentId)}' in parents and name='${escapeDriveQuery(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const params = new URLSearchParams({ q, fields: 'files(id,name,mimeType,webViewLink)', pageSize: '10' });
  const data = await googleJson(driveApi(`/files?${params.toString()}`));
  return data.files?.[0] || null;
}

async function createFolder(parentId: string, name: string): Promise<DriveFile> {
  const data = await googleJson(driveApi('/files?fields=id,name,mimeType,webViewLink'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  return data;
}

async function findOrCreateFolder(parentId: string, name: string) {
  return (await findChildFolder(parentId, name)) || createFolder(parentId, name);
}

async function uploadBuffer(parentId: string, fileName: string, mimeType: string, buffer: Buffer): Promise<DriveFile> {
  const boundary = `aimn_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const metadata = JSON.stringify({ name: fileName, parents: [parentId] });
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    'utf8'
  );
  const tail = Buffer.from(`\r\n--${boundary}--`, 'utf8');
  const body = Buffer.concat([head, buffer, tail]);
  const token = await accessToken();
  const response = await fetch(uploadApi('/files?uploadType=multipart&fields=id,name,mimeType,webViewLink'), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': `multipart/related; boundary=${boundary}`,
      'content-length': String(body.length),
    },
    body,
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(data?.error?.message || `Drive upload failed (${response.status})`);
  return data;
}

async function appendQueueRow(values: any[]) {
  const range = encodeURIComponent(`${env.googleDriveQueueSheetTab}!A:J`);
  const queryString = new URLSearchParams({ valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS' });
  await googleJson(sheetsApi(`/spreadsheets/${encodeURIComponent(env.googleDriveQueueSheetId)}/values/${range}:append?${queryString.toString()}`), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ majorDimension: 'ROWS', values: [values] }),
  });
}

async function updateQueueStatus(storyNumber: number | string, pieceType: string, status: string, publishedAt?: Date) {
  const range = encodeURIComponent(`${env.googleDriveQueueSheetTab}!A:J`);
  const data = await googleJson(sheetsApi(`/spreadsheets/${encodeURIComponent(env.googleDriveQueueSheetId)}/values/${range}`));
  const rows: any[][] = Array.isArray(data.values) ? data.values : [];
  let rowNumber = -1;
  for (let i = rows.length - 1; i >= 1; i--) {
    const row = rows[i] || [];
    if (String(row[0] || '') === String(storyNumber) && String(row[3] || '').toLowerCase() === pieceType.toLowerCase()) {
      rowNumber = i + 1;
      break;
    }
  }
  if (rowNumber < 0) throw new Error('No se encontró la fila de la pieza en COLA_DE_PUBLICACION.');

  const updates: Array<{ range: string; values: any[][] }> = [
    { range: `${env.googleDriveQueueSheetTab}!E${rowNumber}`, values: [[status]] },
  ];
  if (publishedAt) {
    updates.push({
      range: `${env.googleDriveQueueSheetTab}!J${rowNumber}`,
      values: [[publishedAt.toLocaleString('es-MX', { timeZone: 'America/Monterrey' })]],
    });
  }

  const body = {
    valueInputOption: 'USER_ENTERED',
    data: updates,
  };
  await googleJson(sheetsApi(`/spreadsheets/${encodeURIComponent(env.googleDriveQueueSheetId)}/values:batchUpdate`), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function moveDriveFolder(folderId: string, fromParentId: string, toParentId: string): Promise<DriveFile> {
  const params = new URLSearchParams({
    addParents: toParentId,
    removeParents: fromParentId,
    fields: 'id,name,mimeType,webViewLink,parents',
  });
  return googleJson(driveApi(`/files/${encodeURIComponent(folderId)}?${params.toString()}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
}

function socialCopyFor(pieceType: string, facebook?: string | null, instagram?: string | null, fallback?: string) {
  if (pieceType === 'fb' || pieceType === 'breaking') return facebook || instagram || fallback || '';
  return instagram || facebook || fallback || '';
}

function sourceLabel(details: any) {
  const primary = details.sources.find((s: any) => s.is_primary) || details.sources[0];
  if (!primary) return '';
  return primary.source_url ? `${primary.source_name} — ${primary.source_url}` : primary.source_name;
}

export async function saveProductionPiece(params: {
  story: any;
  pieceType: string;
  pieceLabel: string;
  imageBuffer: Buffer;
  imageFilename: string;
  headline: string;
}) : Promise<ProductionSaveResult> {
  if (!env.googleDriveEnabled) throw new Error('Google Drive integration is disabled.');

  const { story, pieceType, pieceLabel, imageBuffer, imageFilename, headline } = params;
  const [details, fbRow, igRow] = await Promise.all([
    storyDetail(story.id),
    one<any>(`SELECT body FROM content_pieces WHERE story_id=$1 AND identity_id=$2 AND content_type='facebook' ORDER BY created_at DESC LIMIT 1`, [story.id, story.identity_id]),
    one<any>(`SELECT body FROM content_pieces WHERE story_id=$1 AND identity_id=$2 AND content_type='instagram' ORDER BY created_at DESC LIMIT 1`, [story.id, story.identity_id]),
  ]);

  const copy = socialCopyFor(pieceType, fbRow?.body, igRow?.body, `${headline}\n\n${story.summary || ''}`);
  const safeType = pieceType.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  const storyFolder = await findOrCreateFolder(env.googleDrivePendingFolderId, `STORY_${story.story_number}_${safeType}`);
  const pieceName = `story_${story.story_number}_${safeType}.png`;
  const copyName = `copy_${safeType}.txt`;
  const metadataName = `info_${safeType}.json`;

  const generatedAt = new Date();
  const metadata = {
    story_id: story.story_number,
    story_uuid: story.id,
    identity: story.identity_name,
    format: pieceType,
    format_label: pieceLabel,
    status: 'PENDIENTE_PUBLICACION',
    headline,
    source: sourceLabel(details),
    generated_at: generatedAt.toISOString(),
  };

  const [pieceFile, copyFile, metadataFile] = await Promise.all([
    uploadBuffer(storyFolder.id, pieceName, 'image/png', imageBuffer),
    uploadBuffer(storyFolder.id, copyName, 'text/plain; charset=utf-8', Buffer.from(copy, 'utf8')),
    uploadBuffer(storyFolder.id, metadataName, 'application/json; charset=utf-8', Buffer.from(JSON.stringify(metadata, null, 2), 'utf8')),
  ]);

  const folderUrl = storyFolder.webViewLink || `https://drive.google.com/drive/folders/${storyFolder.id}`;
  let queueUpdated = false;
  let queueError: string | undefined;
  try {
    await appendQueueRow([
      String(story.story_number),
      story.identity_name || 'Norte En Alerta',
      headline,
      pieceType,
      'PENDIENTE_PUBLICACION',
      pieceFile.webViewLink || `https://drive.google.com/open?id=${pieceFile.id}`,
      copyFile.webViewLink || `https://drive.google.com/open?id=${copyFile.id}`,
      sourceLabel(details),
      generatedAt.toLocaleString('es-MX', { timeZone: 'America/Monterrey' }),
      '',
    ]);
    queueUpdated = true;
  } catch (e: any) {
    queueError = e?.message || String(e);
  }

  await query(
    `INSERT INTO production_exports(story_id,identity_id,format,status,drive_folder_id,drive_piece_file_id,drive_copy_file_id,drive_metadata_file_id,queue_synced,metadata)
     VALUES($1,$2,$3,'pending_publication',$4,$5,$6,$7,$8,$9::jsonb)`,
    [story.id, story.identity_id, pieceType, storyFolder.id, pieceFile.id, copyFile.id, metadataFile.id, queueUpdated, JSON.stringify({ queue_error: queueError || null })]
  );

  return { folderId: storyFolder.id, folderUrl, pieceFile, copyFile, metadataFile, queueUpdated, queueError };
}


export async function markProductionPublished(params: { story: any; pieceType: string }): Promise<ProductionPublishResult> {
  if (!env.googleDriveEnabled) throw new Error('Google Drive integration is disabled.');
  if (!env.googleDrivePublishedFolderId) throw new Error('GOOGLE_DRIVE_PUBLISHED_FOLDER_ID is not configured.');

  const { story, pieceType } = params;
  const exportRow = await one<any>(
    `SELECT * FROM production_exports
     WHERE story_id=$1 AND identity_id=$2 AND format=$3 AND status IN ('pending','pending_publication')
     ORDER BY created_at DESC
     LIMIT 1`,
    [story.id, story.identity_id, pieceType]
  );
  if (!exportRow?.drive_folder_id) {
    throw new Error('No encontré una exportación aprobada pendiente para esta pieza.');
  }

  const moved = await moveDriveFolder(
    exportRow.drive_folder_id,
    env.googleDrivePendingFolderId,
    env.googleDrivePublishedFolderId
  );
  const publishedAt = new Date();
  let queueUpdated = false;
  let queueError: string | undefined;
  try {
    await updateQueueStatus(story.story_number, pieceType, 'PUBLICADA', publishedAt);
    queueUpdated = true;
  } catch (e: any) {
    queueError = e?.message || String(e);
  }

  await query(
    `UPDATE production_exports
     SET status='published', metadata = COALESCE(metadata,'{}'::jsonb) || $1::jsonb
     WHERE id=$2`,
    [JSON.stringify({ published_at: publishedAt.toISOString(), queue_error: queueError || null }), exportRow.id]
  );

  const folderUrl = moved.webViewLink || `https://drive.google.com/drive/folders/${moved.id}`;
  return { folderId: moved.id, folderUrl, queueUpdated, queueError, publishedAt };
}
