import { env } from '../config/env.js';

export type FacebookPhotoPostResult = {
  id?: string;
  postId?: string;
};

type FacebookPageConfig = {
  pageId: string;
  accessToken: string;
};

type FacebookPagesMap = Record<string, FacebookPageConfig>;

function graphBase() {
  return `https://graph.facebook.com/${env.metaGraphVersion}`;
}

function normalizeIdentityCode(identityCode: string) {
  return identityCode.trim().toUpperCase();
}

export function parseFacebookPagesJson(raw: string): FacebookPagesMap {
  if (!raw.trim()) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('FACEBOOK_PAGES_JSON no contiene JSON válido.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('FACEBOOK_PAGES_JSON debe ser un objeto indexado por identityCode.');
  }

  const pages: FacebookPagesMap = {};
  for (const [identityCode, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Configuración de Facebook inválida para ${identityCode}.`);
    }

    const pageId = String((value as Record<string, unknown>).pageId || '').trim();
    const accessToken = String((value as Record<string, unknown>).accessToken || '').trim();
    if (!pageId || !accessToken) {
      throw new Error(`Configuración de Facebook incompleta para ${identityCode}: se requieren pageId y accessToken.`);
    }

    pages[normalizeIdentityCode(identityCode)] = { pageId, accessToken };
  }

  return pages;
}

function configuredPages(): FacebookPagesMap {
  const pages = parseFacebookPagesJson(env.facebookPagesJson);

  // Compatibilidad temporal con la configuración existente de Norte En Alerta.
  if (env.facebookNortePageId && env.facebookNortePageAccessToken && !pages['NL-01']) {
    pages['NL-01'] = {
      pageId: env.facebookNortePageId,
      accessToken: env.facebookNortePageAccessToken,
    };
  }

  return pages;
}

export function facebookPageConfig(identityCode: string): FacebookPageConfig {
  const normalizedCode = normalizeIdentityCode(identityCode);
  const config = configuredPages()[normalizedCode];

  if (!config) {
    throw new Error(`No hay una cuenta de Facebook configurada para la identidad ${normalizedCode}.`);
  }

  return config;
}

export function facebookConfigured(identityCode: string) {
  try {
    facebookPageConfig(identityCode);
    return true;
  } catch {
    return false;
  }
}

function facebookApiError(data: any, status: number) {
  return (
    data?.error?.error_user_msg ||
    data?.error?.message ||
    data?.raw ||
    `Meta Graph API error ${status}`
  );
}

export async function publishFacebookPhotoPost(params: {
  identityCode: string;
  message: string;
  imageBuffer: Buffer;
  filename: string;
  mimeType?: string;
}): Promise<FacebookPhotoPostResult> {
  const { pageId, accessToken } = facebookPageConfig(params.identityCode);

  if (!params.imageBuffer.length) {
    throw new Error('La imagen para Facebook está vacía.');
  }

  const form = new FormData();
  form.append('caption', params.message || '');
  form.append('published', 'true');
  form.append('access_token', accessToken);

  const bytes = new Uint8Array(params.imageBuffer);
  const blob = new Blob([bytes], { type: params.mimeType || 'image/png' });
  form.append('source', blob, params.filename);

  const response = await fetch(`${graphBase()}/${encodeURIComponent(pageId)}/photos`, {
    method: 'POST',
    body: form,
  });

  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(facebookApiError(data, response.status));
  }

  return {
    id: data?.id ? String(data.id) : undefined,
    postId: data?.post_id ? String(data.post_id) : undefined,
  };
}
