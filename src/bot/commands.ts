import type { Bot, Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { query, one } from '../db.js';
import { contextDetails, getSession, setIdentity, setLastStory, setTerritory } from '../services/context.js';
import { runDiscovery } from '../services/discovery.js';
import { findStory, inbox, storyDetail } from '../services/stories.js';
import { generateBundle } from '../services/content.js';
import { chunkText, pct } from './format.js';
import { helpText } from './help.js';
import { normalize } from '../config/network.js';

function args(ctx: Context): string[] {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text || '' : '';
  return text.trim().split(/\s+/).slice(1);
}

async function replyChunks(ctx: Context, text: string) {
  for (const chunk of chunkText(text)) await ctx.reply(chunk);
}

export function registerCommands(bot: Bot) {
  bot.command(['start','ayuda'], async (ctx) => ctx.reply(helpText));

  bot.command('whoami', async (ctx) => {
    await ctx.reply(`Telegram chat id: ${ctx.chat.id}\nUsalo en TELEGRAM_ALLOWED_CHAT_IDS para restringir el bot.`);
  });

  bot.command('estado_actual', async (ctx) => {
    const c = await contextDetails(ctx.chat.id);
    if (!c) return ctx.reply('No pude resolver el contexto actual.');
    await ctx.reply(`AI MEDIA NETWORK\nState Brain: ${c.territory_name} [${c.territory_status}]\nIdentity: ${c.identity_name || 'sin seleccionar'} [${c.identity_status || '-'}]`);
  });

  bot.command('estado', async (ctx) => {
    const value = args(ctx).join(' ');
    if (!value) {
      const states = await query<any>(`SELECT name,status FROM territory_brains WHERE brain_type='state' ORDER BY name`);
      return replyChunks(ctx, states.map(s => `${s.status === 'active' ? '🟢' : '⚪'} ${s.name}`).join('\n'));
    }
    const result = await setTerritory(ctx.chat.id, value);
    await ctx.reply(result.ok ? `State Brain activo: ${result.state.name}\nIdentity: ${result.identity?.name || 'sin identidad activa'}` : result.message);
  });

  bot.command('identidad', async (ctx) => {
    const session = await getSession(ctx.chat.id);
    const value = args(ctx).join(' ');
    if (!value) {
      const rows = await query<any>(`SELECT i.code,i.name,i.status FROM identities i JOIN territory_brains b ON b.id=i.territory_brain_id WHERE b.code=$1 ORDER BY i.code`, [session.territory_code]);
      return ctx.reply(rows.map(r => `${r.status === 'active' ? '🟢' : '🟡'} ${r.name} (${r.code})`).join('\n') || 'No hay identidades configuradas.');
    }
    const result = await setIdentity(ctx.chat.id, value);
    await ctx.reply(result.ok ? `Identity activa: ${result.identity.name}` : result.message);
  });

  bot.command('corrida', async (ctx) => {
    const session = await getSession(ctx.chat.id);
    const period = args(ctx)[0] || '6h';
    await ctx.reply(`Discovery iniciado: ${period}\nState Brain: ${session.territory_code}\nIdentity: ${session.identity_code}\nBuscando, verificando y deduplicando...`);
    try {
      const saved = await runDiscovery(session.territory_code, session.identity_code, period);
      const lines = saved.slice(0, 12).map((s: any) => `${s.is_electoral ? '🗳 ' : ''}#${s.story_number} · ${s.priority} · R ${pct(s.relevance_score)} · C ${pct(s.confidence_score)}\n${s.title}`);
      await replyChunks(ctx, `CORRIDA COMPLETADA\nStories creadas: ${saved.length}\n\n${lines.join('\n\n') || 'No se encontraron Stories con suficiente relevancia.'}\n\n/inbox`);
    } catch (e: any) {
      await ctx.reply(`La corrida fallo: ${e.message}`);
    }
  });

  bot.command('inbox', async (ctx) => {
    const session = await getSession(ctx.chat.id);
    const rows = await inbox(session.identity_code, 15);
    if (!rows.length) return ctx.reply('Story Inbox vacio. Ejecuta /corrida 6h');
    const text = rows.map((r: any) => `${r.is_electoral ? '🗳 ' : ''}#${r.story_number} · ${r.priority_label} · R ${pct(r.relevance_score)} · C ${pct(r.confidence_score)}\n${r.title}\n${r.decision}`).join('\n\n');
    await replyChunks(ctx, `STORY INBOX\n\n${text}`);
  });

  bot.command('story', async (ctx) => {
    const session = await getSession(ctx.chat.id);
    const ref = args(ctx)[0];
    const story = await findStory(session.identity_code, ref, session.last_story_id);
    if (!story) return ctx.reply('Story no encontrada. Usa /inbox.');
    await setLastStory(ctx.chat.id, story.id);
    const d = await storyDetail(story.id);
    const topics = d.topics.map((t: any) => `- ${t.name}: ${pct(t.relevance_score)}`).join('\n') || '-';
    const profiles = d.profiles.map((p: any) => `- ${p.name} (${p.relation}): ${pct(p.relevance_score)}`).join('\n') || '-';
    const sources = d.sources.map((s: any) => `- ${s.is_primary ? '✓ ' : ''}${s.source_name} [${s.source_tier || '-'}]\n  ${s.source_url || ''}`).join('\n') || '-';
    const claims = d.claims.map((c: any) => `- ${c.verification_status.toUpperCase()}: ${c.claim_text}${c.attribution ? ` — ${c.attribution}` : ''}`).join('\n') || '-';
    const keyboard = new InlineKeyboard().text('✨ Generar todo', `generate:${story.story_number}:todo`).text('🧾 Inbox', 'inbox');
    await replyChunks(ctx, `STORY #${story.story_number}\n${story.title}\n\nPriority: ${story.priority_label}\nRelevance: ${pct(story.relevance_score)}\nConfidence: ${pct(story.confidence_score)}\nDecision: ${story.decision}\n\nTOPICS\n${topics}\n\nPROFILES\n${profiles}\n\nSOURCES\n${sources}\n\nCLAIMS\n${claims}\n\n/generar ${story.story_number} todo`);
    await ctx.reply('Acciones:', { reply_markup: keyboard });
  });

  bot.command('generar', async (ctx) => {
    const session = await getSession(ctx.chat.id);
    const a = args(ctx);
    const ref = a[0] && a[0] !== 'todo' ? a[0] : undefined;
    const kind = (ref ? a[1] : a[0]) || 'todo';
    const story = await findStory(session.identity_code, ref, session.last_story_id);
    if (!story) return ctx.reply('Story no encontrada. Usa /story <numero>.');
    if (Number(story.confidence_score) < .6) return ctx.reply(`Generacion bloqueada. Confidence ${pct(story.confidence_score)}. Revisa Claims antes de producir.`);
    await ctx.reply(`Generando ${kind} para Story #${story.story_number}...`);
    try {
      const b = await generateBundle(story, kind);
      await replyChunks(ctx, `CONTENT BUNDLE #${story.story_number}\n\nTITULAR\n${b.headline || '-'}\n\nBAJADA\n${b.subheadline || '-'}\n\nARTICULO\n${b.article || '-'}\n\nFACEBOOK\n${b.facebook || '-'}\n\nINSTAGRAM\n${b.instagram || '-'}\n\nX\n${b.x || '-'}\n\n4:5\n${JSON.stringify(b.graphic_4x5 || {}, null, 2)}\n\n9:16\n${JSON.stringify(b.story_9x16 || {}, null, 2)}\n\nREEL\n${JSON.stringify(b.reel || {}, null, 2)}`);
    } catch (e: any) {
      await ctx.reply(`No pude generar el paquete: ${e.message}`);
    }
  });

  bot.command('elecciones', async (ctx) => {
    const session = await getSession(ctx.chat.id);
    const rows = await query<any>(`
      SELECT s.story_number,s.title,s.confidence_score,iss.relevance_score,iss.priority_label
      FROM stories s JOIN story_topics st ON st.story_id=s.id JOIN topics t ON t.id=st.topic_id
      JOIN identity_story_scores iss ON iss.story_id=s.id JOIN identities i ON i.id=iss.identity_id
      WHERE i.code=$1 AND t.topic_type='electoral_process'
      ORDER BY iss.relevance_score DESC,s.first_detected_at DESC LIMIT 15`, [session.identity_code]);
    const text = rows.map(r => `🗳 #${r.story_number} · ${r.priority_label} · R ${pct(r.relevance_score)} · C ${pct(r.confidence_score)}\n${r.title}`).join('\n\n');
    await replyChunks(ctx, `ELECTION DESK\nProceso Electoral 2026-2027\n\n${text || 'Sin Stories electorales. Ejecuta /corrida 24h.'}`);
  });

  bot.command('urgente', async (ctx) => {
    const session = await getSession(ctx.chat.id);
    const rows = await inbox(session.identity_code, 25);
    const urgent = rows.filter((r: any) => ['CRITICAL','HIGH'].includes(r.priority_label));
    await replyChunks(ctx, urgent.map((r: any) => `#${r.story_number} · ${r.priority_label} · ${pct(r.relevance_score)}\n${r.title}`).join('\n\n') || 'No hay Stories urgentes.');
  });

  bot.command('resumen', async (ctx) => {
    const session = await getSession(ctx.chat.id);
    const rows = await inbox(session.identity_code, 10);
    const electionCount = rows.filter((r: any) => r.is_electoral).length;
    const high = rows.filter((r: any) => ['CRITICAL','HIGH'].includes(r.priority_label)).length;
    await replyChunks(ctx, `BRIEF\nStories visibles: ${rows.length}\nAlta prioridad: ${high}\nElectorales: ${electionCount}\n\n${rows.slice(0,5).map((r:any)=>`#${r.story_number} ${r.title}`).join('\n') || 'Sin Stories.'}`);
  });

  bot.command('topic', async (ctx) => {
    const session = await getSession(ctx.chat.id);
    const value = args(ctx).join(' ');
    if (!value) return ctx.reply('Uso: /topic Agua');
    const rows = await query<any>('SELECT t.* FROM topics t JOIN territory_brains b ON b.id=t.territory_brain_id WHERE b.code=$1', [session.territory_code]);
    const n = normalize(value);
    const t = rows.find((r:any)=>normalize(r.name)===n || normalize(r.code)===n || normalize(r.slug)===n);
    if (!t) return ctx.reply('Topic no encontrado.');
    const stories = await query<any>('SELECT s.story_number,s.title,st.relevance_score FROM story_topics st JOIN stories s ON s.id=st.story_id WHERE st.topic_id=$1 ORDER BY st.relevance_score DESC,s.first_detected_at DESC LIMIT 8', [t.id]);
    await replyChunks(ctx, `TOPIC ${t.code}\n${t.name}\nPriority: ${pct(t.priority)}\nType: ${t.topic_type}\nMonitor: ${t.monitor_enabled ? 'ON' : 'OFF'}\n\nStories:\n${stories.map((s:any)=>`#${s.story_number} ${pct(s.relevance_score)} ${s.title}`).join('\n') || '-'}`);
  });

  bot.command('profile', async (ctx) => {
    const session = await getSession(ctx.chat.id);
    const value = args(ctx).join(' ');
    if (!value) return ctx.reply('Uso: /profile Samuel Garcia');
    const rows = await query<any>('SELECT p.* FROM profiles p JOIN territory_brains b ON b.id=p.territory_brain_id WHERE b.code=$1', [session.territory_code]);
    const n = normalize(value);
    const p = rows.find((r:any)=> normalize(r.name)===n || normalize(r.code||'')===n || (r.aliases||[]).some((a:string)=>normalize(a)===n));
    if (!p) return ctx.reply('Profile no encontrado.');
    const stories = await query<any>('SELECT s.story_number,s.title,sp.relevance_score,sp.relation FROM story_profiles sp JOIN stories s ON s.id=sp.story_id WHERE sp.profile_id=$1 ORDER BY sp.relevance_score DESC,s.first_detected_at DESC LIMIT 8', [p.id]);
    await replyChunks(ctx, `PROFILE ${p.code || ''}\n${p.name}\nType: ${p.profile_type}\nImportance: ${pct(p.importance)}\nMonitor: ${p.monitor_enabled ? 'ON' : 'OFF'}\n\nStories:\n${stories.map((s:any)=>`#${s.story_number} ${s.relation} ${pct(s.relevance_score)} ${s.title}`).join('\n') || '-'}`);
  });

  bot.command('watch', async (ctx) => {
    const session = await getSession(ctx.chat.id);
    const value = args(ctx).join(' ');
    if (!value) return ctx.reply('Uso: /watch Samuel Garcia');
    const brain = await one<any>('SELECT id FROM territory_brains WHERE code=$1', [session.territory_code]);
    const n = normalize(value);
    await query(`INSERT INTO watch_items(territory_brain_id,item_type,label,normalized_label,priority) VALUES($1,'auto',$2,$3,1.0) ON CONFLICT(territory_brain_id,item_type,normalized_label) DO UPDATE SET priority=1.0`, [brain.id,value,n]);
    await ctx.reply(`Watch activado: ${value}\nPriority: CRITICAL`);
  });

  bot.command('fuentes', async (ctx) => {
    const session = await getSession(ctx.chat.id);
    const rows = await query<any>('SELECT s.name,s.domain,s.source_type,s.reliability_score,s.metadata FROM sources s JOIN territory_brains b ON b.id=s.territory_brain_id WHERE b.code=$1 AND s.monitor_enabled=true ORDER BY s.reliability_score DESC,s.name', [session.territory_code]);
    await replyChunks(ctx, `SOURCES\n\n${rows.map((s:any)=>`${s.metadata?.tier || '-'} · ${pct(s.reliability_score)} · ${s.name}\n${s.domain || ''}`).join('\n\n') || '-'}`);
  });

  bot.command('ready', async (ctx) => {
    const session = await getSession(ctx.chat.id);
    const rows = await query<any>(`SELECT cp.id,cp.content_type,cp.format,cp.headline,cp.created_at,s.story_number,s.title FROM content_pieces cp JOIN stories s ON s.id=cp.story_id JOIN identities i ON i.id=cp.identity_id WHERE i.code=$1 AND cp.status='content_ready' ORDER BY cp.created_at DESC LIMIT 20`, [session.identity_code]);
    await replyChunks(ctx, `CONTENT READY\n\n${rows.map((r:any)=>`#${r.story_number} · ${r.content_type}/${r.format || '-'}\n${r.headline || r.title}`).join('\n\n') || 'Sin contenido listo.'}`);
  });

  bot.command('pieza', async (ctx) => {
    const session = await getSession(ctx.chat.id);
    const a = args(ctx);
    const story = await findStory(session.identity_code, a[0], session.last_story_id);
    if (!story) return ctx.reply('Story no encontrada.');
    const format = a[1] || '4:5';
    const cp = await one<any>(`SELECT body,headline FROM content_pieces WHERE story_id=$1 AND identity_id=$2 AND content_type IN ('graphic','story') AND format=$3 ORDER BY created_at DESC LIMIT 1`, [story.id,story.identity_id,format]);
    if (!cp) return ctx.reply(`Todavia no hay especificacion ${format}. Ejecuta /generar ${story.story_number} todo primero.`);
    await ctx.reply(`VISUAL SPEC #${story.story_number} · ${format}\n${cp.headline || ''}\n${cp.body}\n\nEl render grafico automatico se conecta en la siguiente fase.`);
  });

  bot.callbackQuery('inbox', async (ctx) => {
    await ctx.answerCallbackQuery();
    const session = await getSession(ctx.chat!.id);
    const rows = await inbox(session.identity_code, 10);
    await ctx.reply(rows.map((r:any)=>`#${r.story_number} ${r.priority_label} ${pct(r.relevance_score)}\n${r.title}`).join('\n\n') || 'Inbox vacio.');
  });

  bot.callbackQuery(/^generate:(\d+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Generando...' });
    const [, ref, kind] = ctx.match as RegExpMatchArray;
    const session = await getSession(ctx.chat!.id);
    const story = await findStory(session.identity_code, ref, session.last_story_id);
    if (!story) return ctx.reply('Story no encontrada.');
    try {
      const b = await generateBundle(story, kind);
      await replyChunks(ctx, `CONTENT BUNDLE #${story.story_number}\n\n${b.headline}\n${b.subheadline}\n\n${b.article}\n\nFB\n${b.facebook}\n\nIG\n${b.instagram}`);
    } catch (e:any) { await ctx.reply(`Error: ${e.message}`); }
  });
}
