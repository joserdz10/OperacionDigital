import { one, query } from '../db.js';
import { defaultContext, normalize } from '../config/network.js';

export type OperatorSession = {
  chat_id: string;
  territory_code: string;
  identity_code: string;
  last_story_id: string | null;
};

export async function getSession(chatId: number): Promise<OperatorSession> {
  const row = await one<OperatorSession>('SELECT * FROM operator_sessions WHERE chat_id=$1', [chatId]);
  if (row) return row;
  await query(
    `INSERT INTO operator_sessions(chat_id,territory_code,identity_code) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
    [chatId, defaultContext.territoryCode, defaultContext.identityCode]
  );
  return (await one<OperatorSession>('SELECT * FROM operator_sessions WHERE chat_id=$1', [chatId]))!;
}

export async function setTerritory(chatId: number, input: string) {
  const states = await query<any>(`SELECT code,name,slug,status FROM territory_brains WHERE brain_type='state' ORDER BY name`);
  const n = normalize(input);
  const state = states.find((s) => [s.code, s.name, s.slug].some((x: string) => normalize(x) === n));
  if (!state) return { ok: false as const, message: 'Estado no encontrado.' };
  if (state.status !== 'active') return { ok: false as const, message: `${state.name} existe en la red, pero todavia no esta activo.` };
  const identities = await query<any>('SELECT code,name,status FROM identities WHERE territory_brain_id=(SELECT id FROM territory_brains WHERE code=$1) ORDER BY code', [state.code]);
  const activeIdentity = identities.find((i) => i.status === 'active');
  await query('UPDATE operator_sessions SET territory_code=$2, identity_code=$3, last_story_id=NULL, updated_at=now() WHERE chat_id=$1', [chatId, state.code, activeIdentity?.code || '']);
  return { ok: true as const, state, identity: activeIdentity || null };
}

export async function setIdentity(chatId: number, input: string) {
  const session = await getSession(chatId);
  const identities = await query<any>(`SELECT i.code,i.name,i.status FROM identities i JOIN territory_brains b ON b.id=i.territory_brain_id WHERE b.code=$1 ORDER BY i.code`, [session.territory_code]);
  const n = normalize(input);
  const identity = identities.find((i) => [i.code, i.name].some((x: string) => normalize(x || '') === n));
  if (!identity) return { ok: false as const, message: 'Identidad no encontrada en el State Brain activo.' };
  if (identity.status !== 'active') return { ok: false as const, message: `${identity.name} esta configurada, pero todavia no esta activa.` };
  await query('UPDATE operator_sessions SET identity_code=$2,last_story_id=NULL,updated_at=now() WHERE chat_id=$1', [chatId, identity.code]);
  return { ok: true as const, identity };
}

export async function setLastStory(chatId: number, storyId: string) {
  await query('UPDATE operator_sessions SET last_story_id=$2,updated_at=now() WHERE chat_id=$1', [chatId, storyId]);
}

export async function contextDetails(chatId: number) {
  const session = await getSession(chatId);
  return one<any>(`
    SELECT b.code territory_code,b.name territory_name,b.status territory_status,
           i.code identity_code,i.name identity_name,i.status identity_status
    FROM territory_brains b
    LEFT JOIN identities i ON i.code=$2 AND i.territory_brain_id=b.id
    WHERE b.code=$1`, [session.territory_code, session.identity_code]);
}
