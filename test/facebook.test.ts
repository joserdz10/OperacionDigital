import assert from 'node:assert/strict';
import test from 'node:test';

process.env.TELEGRAM_BOT_TOKEN ||= 'test';
process.env.OPENAI_API_KEY ||= 'test';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';

const { parseFacebookPagesJson } = await import('../src/services/facebook.js');

test('parseFacebookPagesJson normaliza códigos y acepta múltiples identidades', () => {
  const config = parseFacebookPagesJson(JSON.stringify({
    'nl-01': { pageId: '123', accessToken: 'token-a' },
    'HGO-01': { pageId: '456', accessToken: 'token-b' },
  }));

  assert.deepEqual(config, {
    'NL-01': { pageId: '123', accessToken: 'token-a' },
    'HGO-01': { pageId: '456', accessToken: 'token-b' },
  });
});

test('parseFacebookPagesJson rechaza JSON inválido', () => {
  assert.throws(
    () => parseFacebookPagesJson('{not-json'),
    /FACEBOOK_PAGES_JSON no contiene JSON válido/
  );
});

test('parseFacebookPagesJson exige pageId y accessToken por identidad', () => {
  assert.throws(
    () => parseFacebookPagesJson(JSON.stringify({
      'NL-01': { pageId: '123' },
    })),
    /Configuración de Facebook incompleta para NL-01/
  );
});

test('parseFacebookPagesJson rechaza estructuras que no sean mapas', () => {
  assert.throws(
    () => parseFacebookPagesJson(JSON.stringify([{ pageId: '123', accessToken: 'token' }])),
    /debe ser un objeto indexado por identityCode/
  );
});
