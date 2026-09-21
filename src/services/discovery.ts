import { openai, extractJson } from './openai.js';
import { env } from '../config/env.js';
import { one, query } from '../db.js';

function clamp(n: any, fallback = 0.5) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : fallback;
}

function periodToHours(period: string) {
  const normalized = String(period || '6h').trim().toLowerCase();
  const match = normalized.match(/^(\d{1,3})(h|d)$/);
  if (!match) return 6;
  const value = Number(match[1]);
  const hours = match[2] === 'd' ? value * 24 : value;
  return Math.max(1, Math.min(168, hours));
}

function normalizeText(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'de','la','el','los','las','un','una','unos','unas','y','o','en','por','para','con',
  'del','al','que','se','su','sus','a','ante','bajo','desde','hasta','sobre','entre'
]);

function tokens(value: any) {
  return new Set(
    normalizeText(value)
      .split(' ')
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
  );
}

function similarity(a: any, b: any) {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection++;
  return intersection / (left.size + right.size - intersection);
}

function canonicalUrl(value: any) {
  try {
    const u = new URL(String(value || ''));
    u.hash = '';
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','fbclid','gclid']
      .forEach((key) => u.searchParams.delete(key));
    return u.toString().replace(/\/$/, '');
  } catch {
    return String(value || '').trim().replace(/\/$/, '');
  }
}

function candidateScore(story: any) {
  const relevance = clamp(story.relevance_score);
  const importance = clamp(story.importance_score);
  const confidence = clamp(story.confidence_score);
  const sources = Array.isArray(story.sources) ? story.sources : [];
  const primaryBonus = sources.some((source: any) => source?.primary) ? 0.04 : 0;
  const multiSourceBonus = Math.min(0.05, Math.max(0, sources.length - 1) * 0.015);
  return relevance * 0.42 + importance * 0.30 + confidence * 0.28 + primaryBonus + multiSourceBonus;
}

function primarySourceUrls(story: any) {
  return (Array.isArray(story.sources) ? story.sources : [])
    .map((source: any) => canonicalUrl(source?.url))
    .filter(Boolean);
}

function isDuplicate(a: any, b: any) {
  const urlsA = new Set(primarySourceUrls(a));
  const urlsB = primarySourceUrls(b);
  if (urlsB.some((url: string) => urlsA.has(url))) return true;

  const titleSimilarity = similarity(a.title, b.title);
  if (titleSimilarity >= 0.68) return true;

  if (titleSimilarity >= 0.48 && similarity(a.summary, b.summary) >= 0.58) return true;
  return false;
}

const STORY_SHAPE = `{
  "stories": [
    {
      "title": "working headline",
      "summary": "2-4 sentence factual summary",
      "scope": "state|municipal|national|international",
      "importance_score": 0.0,
      "confidence_score": 0.0,
      "relevance_score": 0.0,
      "priority": "P0|P1|P2|P3|P4",
      "is_electoral": false,
      "topics": [{"code":"STATE-Txx","name":"...","score":0.0}],
      "profiles": [{"code":"STATE-Pxxx","name":"...","relation":"mentioned|subject|related","score":0.0}],
      "sources": [{"name":"...","url":"https://...","tier":"A|B|C|D","primary":true}],
      "claims": [{"text":"...","status":"verified|supported|unverified|contradicted","confidence":0.0,"attribution":"..."}],
      "recommended_angle": "...",
      "recommended_format": "article|breaking|brief|analysis|explainer"
    }
  ]
}`;

export async function runDiscovery(territoryCode: string, identityCode: string, period = '6h', signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('DISCOVERY_CANCELLED');
  const brain = await one<any>('SELECT id,name,timezone FROM territory_brains WHERE code=$1', [territoryCode]);
  const identity = await one<any>('SELECT id,name FROM identities WHERE code=$1', [identityCode]);
  if (!brain || !identity) throw new Error('Active State Brain or identity not found.');

  const topics = await query<any>(
    'SELECT code,name,priority,semantic_queries FROM topics WHERE territory_brain_id=$1 AND monitor_enabled=true ORDER BY priority DESC LIMIT 40',
    [brain.id]
  );
  const profiles = await query<any>(
    'SELECT code,name,profile_type,importance,aliases FROM profiles WHERE territory_brain_id=$1 AND monitor_enabled=true ORDER BY importance DESC LIMIT 50',
    [brain.id]
  );
  const sources = await query<any>(
    'SELECT name,domain,source_type,reliability_score,metadata FROM sources WHERE territory_brain_id=$1 AND monitor_enabled=true ORDER BY reliability_score DESC LIMIT 40',
    [brain.id]
  );

  const hours = periodToHours(period);
  const finalTarget = Math.max(15, Math.min(25, Number(process.env.NEWS_INBOX_TARGET || 25)));
  const resultsPerLane = Math.max(5, Math.min(10, Number(process.env.SEARCH_RESULTS_PER_QUERY || 10)));
  const concurrency = Math.max(1, Math.min(4, Number(process.env.NEWS_SEARCH_CONCURRENCY || 3)));

  const monitoredTopics = topics
    .slice(0, 24)
    .map((t: any) => {
      const queries = Array.isArray(t.semantic_queries) ? t.semantic_queries.slice(0, 3).join(', ') : '';
      return `- ${t.code}: ${t.name} [priority ${t.priority}]${queries ? ` | queries: ${queries}` : ''}`;
    })
    .join('\n');

  const monitoredProfiles = profiles
    .slice(0, 30)
    .map((p: any) => {
      const aliases = Array.isArray(p.aliases) ? p.aliases.slice(0, 3).join(', ') : '';
      return `- ${p.code}: ${p.name} [${p.profile_type}]${aliases ? ` | aliases: ${aliases}` : ''}`;
    })
    .join('\n');

  const preferredSources = sources
    .slice(0, 30)
    .map((s: any) => `- ${s.name} (${s.domain || 'n/a'})`)
    .join('\n');

  const lanes = [
    {
      name: 'panorama',
      focus: `Panorama general y breaking news de ${brain.name}. Recorre capital, zona metropolitana y municipios relevantes. Busca hechos distintos y recientes, no una sola noticia dominante.`,
    },
    {
      name: 'gobierno_politica',
      focus: `Gobierno estatal, Congreso, ayuntamientos, presupuesto, obra publica, decisiones institucionales, partidos, actores politicos y asuntos electorales con relevancia para ${brain.name}.`,
    },
    {
      name: 'seguridad_justicia',
      focus: `Seguridad, justicia, fiscalia, proteccion civil, emergencias, accidentes, incendios, operativos y hechos de alto impacto ciudadano en ${brain.name}.`,
    },
    {
      name: 'movilidad_servicios',
      focus: `Movilidad, transporte, metro, carreteras, trafico, agua, energia, infraestructura, clima, salud, educacion y servicios publicos de ${brain.name}.`,
    },
    {
      name: 'economia',
      focus: `Economia, empresas, industria, comercio, empleo, inversiones, turismo, precios y actividad productiva con impacto en ${brain.name}.`,
    },
    {
      name: 'sociedad',
      focus: `Sociedad, universidades, cultura, ciencia, medio ambiente, comunidades, derechos, tendencias y temas ciudadanos relevantes en ${brain.name}.`,
    },
    {
      name: 'deportes',
      focus: `Deportes, equipos, atletas, partidos, resultados, fichajes y agenda deportiva con interes claro para audiencias de ${brain.name}.`,
    },
    {
      name: 'topics_profiles',
      focus: `Haz un barrido especifico de los TOPICS y PROFILES monitoreados. Busca desarrollos nuevos, menciones relevantes y hechos materiales aunque no sean la principal noticia del dia.`,
    },
    {
      name: 'source_sweep',
      focus: `Haz un barrido adicional de las fuentes preferidas y fuentes primarias/oficiales disponibles para detectar noticias que los otros bloques pudieron omitir. Prioriza diversidad de hechos y municipios.`,
    },
  ];

  const basePrompt = `You are the Discovery Engine for AI Media Network.

ACTIVE STATE BRAIN: ${brain.name}
ACTIVE IDENTITY: ${identity.name}
TIME WINDOW: last ${hours} hours
CURRENT UTC: ${new Date().toISOString()}

MISSION
Perform broad, multi-source news discovery. Do not stop after finding one strong story. Search several formulations and sources for the assigned lane. Return DISTINCT events only.

FRESHNESS
Prioritize material published or materially updated inside the requested window. Do not present old information as current. If an older event has a genuinely new development, summarize only the new development.

VERIFICATION
Every story must include at least one real source URL discovered on the web. Prefer primary and configured sources, but use other credible reporting when needed. Sensitive claims should be attributed and, when possible, cross-checked. If essential facts cannot be confirmed, lower confidence or omit the story.

POLITICS AND ELECTIONS
Be neutral and factual. Describe documented positions, actions, records and claims with attribution. Do not endorse, oppose, rank, score, recommend, label a political actor as better/worse, or predict an election outcome. Election statuses such as aspirant, precandidate and candidate must be exact.

DEDUPLICATION
Do not return multiple versions of the same event just because different outlets covered it. Prefer the clearest and best-sourced version, while preserving multiple source URLs when useful.

MONITORED TOPICS
${monitoredTopics || '- none configured'}

MONITORED PROFILES
${monitoredProfiles || '- none configured'}

PREFERRED SOURCES
${preferredSources || '- none configured'}

Return ONLY valid JSON with this exact top-level shape:
${STORY_SHAPE}

Return up to ${resultsPerLane} distinct stories for this lane. If fewer credible current stories exist, return fewer. Never invent filler.`;

  async function searchLane(lane: { name: string; focus: string }) {
    if (signal?.aborted) throw new Error('DISCOVERY_CANCELLED');
    const response = await openai.responses.create({
      model: env.openaiModel,
      tools: [{ type: 'web_search' } as any],
      input: `${basePrompt}

DISCOVERY LANE: ${lane.name}
FOCUS: ${lane.focus}

Search broadly now and return the JSON.`,
    }, { signal });

    const parsed = extractJson(response.output_text || '{"stories":[]}');
    const found = Array.isArray(parsed.stories) ? parsed.stories : [];
    return found.map((story: any) => ({
      ...story,
      discovery_lane: lane.name,
    }));
  }

  const raw: any[] = [];
  const laneErrors: Array<{ lane: string; error: string }> = [];

  for (let i = 0; i < lanes.length; i += concurrency) {
    if (signal?.aborted) throw new Error('DISCOVERY_CANCELLED');
    const batch = lanes.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map(searchLane));

    if (signal?.aborted) throw new Error('DISCOVERY_CANCELLED');

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') raw.push(...result.value);
      else {
        laneErrors.push({
          lane: batch[index].name,
          error: String((result.reason as any)?.message || result.reason || 'unknown error').slice(0, 300),
        });
      }
    });
  }

  const eligible = raw
    .filter((story: any) => story?.title && Array.isArray(story.sources) && story.sources.some((source: any) => source?.url))
    .sort((a: any, b: any) => candidateScore(b) - candidateScore(a));

  const deduped: any[] = [];
  let duplicatesRemoved = 0;

  for (const story of eligible) {
    if (deduped.some((existing) => isDuplicate(existing, story))) {
      duplicatesRemoved++;
      continue;
    }
    deduped.push(story);
  }

  const recent = await query<any>(
    `SELECT id,title,summary
     FROM stories
     WHERE origin_brain_id=$1
       AND first_detected_at >= now() - ($2::int * interval '1 hour')
     ORDER BY first_detected_at DESC
     LIMIT 250`,
    [brain.id, Math.max(24, Math.min(168, hours * 4))]
  );

  const fresh: any[] = [];
  let existingRemoved = 0;

  for (const story of deduped) {
    const alreadyExists = recent.some((existing: any) => {
      const titleSim = similarity(existing.title, story.title);
      if (titleSim >= 0.82) return true;
      return titleSim >= 0.64 && similarity(existing.summary, story.summary) >= 0.68;
    });
    if (alreadyExists) {
      existingRemoved++;
      continue;
    }
    fresh.push(story);
  }

  const selected = fresh.slice(0, finalTarget);
  const saved: any[] = [];

  for (const s of selected) {
    if (signal?.aborted) throw new Error('DISCOVERY_CANCELLED');
    const story = await one<any>(`
      INSERT INTO stories(origin_brain_id,scope,title,summary,status,importance_score,confidence_score,raw_payload)
      VALUES($1,$2,$3,$4,'ready',$5,$6,$7::jsonb)
      RETURNING id,story_number,title`, [
        brain.id,
        ['national','state','municipal','international'].includes(s.scope) ? s.scope : 'state',
        s.title,
        s.summary || '',
        clamp(s.importance_score),
        clamp(s.confidence_score),
        JSON.stringify(s),
      ]);
    if (!story) continue;

    await query(
      'INSERT INTO story_territories(story_id,territory_brain_id,relevance_score,local_angle) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [story.id, brain.id, clamp(s.relevance_score), s.recommended_angle || null]
    );

    for (const t of (s.topics || [])) {
      const topic = await one<any>(
        'SELECT id FROM topics WHERE territory_brain_id=$1 AND (code=$2 OR lower(name)=lower($3)) LIMIT 1',
        [brain.id, t.code || '', t.name || '']
      );
      if (topic) {
        await query(
          'INSERT INTO story_topics(story_id,topic_id,relevance_score) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [story.id, topic.id, clamp(t.score)]
        );
      }
    }

    for (const p of (s.profiles || [])) {
      const profile = await one<any>(
        'SELECT id FROM profiles WHERE territory_brain_id=$1 AND (code=$2 OR lower(name)=lower($3)) LIMIT 1',
        [brain.id, p.code || '', p.name || '']
      );
      if (profile) {
        await query(
          'INSERT INTO story_profiles(story_id,profile_id,relation,relevance_score) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
          [story.id, profile.id, p.relation || 'related', clamp(p.score)]
        );
      }
    }

    for (const source of (s.sources || [])) {
      if (!source?.name) continue;
      await query(
        'INSERT INTO story_sources(story_id,source_name,source_url,source_tier,is_primary) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
        [story.id, source.name, source.url || '', source.tier || 'B', !!source.primary]
      );
    }

    for (const c of (s.claims || [])) {
      await query(
        'INSERT INTO story_claims(story_id,claim_text,claim_type,verification_status,confidence_score,attribution) VALUES($1,$2,$3,$4,$5,$6)',
        [story.id, c.text || '', s.is_electoral ? 'electoral_claim' : 'fact', c.status || 'unverified', clamp(c.confidence), c.attribution || null]
      );
    }

    const rel = clamp(s.relevance_score);
    const priorityLabel = rel >= .9 ? 'CRITICAL' : rel >= .75 ? 'HIGH' : rel >= .6 ? 'MEDIUM' : rel >= .4 ? 'LOW' : 'IGNORE';

    await query(
      `INSERT INTO identity_story_scores(story_id,identity_id,territory_score,topic_score,profile_score,national_feed_score,editorial_priority_score,relevance_score,priority_label,recommended_angle,recommended_format,decision)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT(story_id,identity_id) DO UPDATE SET
         relevance_score=EXCLUDED.relevance_score,
         priority_label=EXCLUDED.priority_label,
         recommended_angle=EXCLUDED.recommended_angle,
         recommended_format=EXCLUDED.recommended_format,
         decision=EXCLUDED.decision,
         scored_at=now()`,
      [
        story.id,
        identity.id,
        rel,
        rel,
        rel,
        s.scope === 'national' ? rel : 0,
        clamp(s.importance_score),
        rel,
        priorityLabel,
        s.recommended_angle || '',
        s.recommended_format || 'article',
        rel >= .6 ? 'PUBLISH' : 'WATCH',
      ]
    );

    saved.push({
      ...story,
      priority: s.priority || 'P2',
      relevance_score: rel,
      confidence_score: clamp(s.confidence_score),
      is_electoral: !!s.is_electoral,
    });
  }

  const uniqueSources = new Set(
    selected
      .flatMap((story: any) => primarySourceUrls(story))
      .map((url: string) => {
        try { return new URL(url).hostname.replace(/^www\./, ''); }
        catch { return url; }
      })
      .filter(Boolean)
  );

  (saved as any).stats = {
    period,
    lookback_hours: hours,
    lanes_attempted: lanes.length,
    lanes_failed: laneErrors.length,
    raw_results: raw.length,
    eligible_results: eligible.length,
    duplicates_removed: duplicatesRemoved,
    existing_removed: existingRemoved,
    candidates_after_dedupe: fresh.length,
    final_target: finalTarget,
    saved: saved.length,
    unique_sources: uniqueSources.size,
    lane_errors: laneErrors,
  };

  return saved;
}
