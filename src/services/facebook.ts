import { env } from '../config/env.js';

export type FacebookPhotoPostResult = {
  id?: string;
  postId?: string;
};

function graphBase() {
  return `https://graph.facebook.com/${env.metaGraphVersion}`;
}

function pageConfig(identityCode: string) {
  if (identityCode === 'NL-01') {
    if (!env.facebookNortePageId || !env.facebookNortePageAccessToken) {
      throw new Error('Facebook de Norte En Alerta no está configurado en Railway.');
    }
    return {
      pageId: env.facebookNortePageId,
      accessToken: env.facebookNortePageAccessToken,
    };
  }

  throw new Error(`No hay una cuenta de Facebook configurada para la identidad ${identityCode}.`);
}

export function facebookConfigured(identityCode: string) {
  try {
    pageConfig(identityCode);
    return true;
  } catch {
    return false;
  }
}

export async function publishFacebookPhotoPost(params: {
  identityCode: string;
  message: string;
  imageBuffer: Buffer;
  filename: string;
  mimeType?: string;
}): Promise<FacebookPhotoPostResult> {
  const { pageId, accessToken } = pageConfig(params.identityCode);

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
    const message =
      data?.error?.error_user_msg ||
      data?.error?.message ||
      data?.raw ||
      `Meta Graph API error ${response.status}`;
    throw new Error(message);
  }

  return {
    id: data?.id ? String(data.id) : undefined,
    postId: data?.post_id ? String(data.post_id) : undefined,
  };
}
