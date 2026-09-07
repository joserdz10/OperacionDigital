import { openai, extractJson } from './openai.js';
import { env } from '../config/env.js';
import { one, query } from '../db.js';

function clamp(n: any, fallback = 0.5) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : fallback;
}

export async function runDiscovery(territoryCode: string, identityCode: string, period = '6h') {
  const brain = await one<any>('SELECT id,name,timezone FROM territory_brains WHERE code=$1', [territoryCode]);
  const identity = await one<any>('SELECT id,name FROM identities WHERE code=$1', [identityCode]);
  if (!brain || !identity) throw new Error('Active State Brain or identity not found.');

  const topics = await query<any>('SELECT code,name,priority,semantic_queries FROM topics WHERE territory_brain_id=$1 AND monitor_enabled=true ORDER BY priority DESC LIMIT 40', [brain.id]);
  const profiles = await query<any>('SELECT code,name,profile_type,importance,aliases FROM profiles WHERE territory_brain_id=$1 AND monitor_enabled=true ORDER BY importance DESC LIMIT 50', [brain.id]);
  const sources = await query<any>('SELECT name,domain,source_type,reliability_score,metadata FROM sources WHERE territory_brain_id=$1 AND monitor_enabled=true ORDER BY reliability_score DESC LIMIT 40', [brain.id]);

  const prompt = `You are the Discovery Engine for AI Media Network.\n\nACTIVE STATE BRAIN: ${brain.name}\nACTIVE IDENTITY: ${identity.name}\nTIME WINDOW: ${period}\nCURRENT UTC: ${new Date().toISOString()}\n\nUse web search to find CURRENT news materially relevant to the state in the requested time window. Prefer the configured sources, but use other credible primary/press sources when necessary. Deduplicate the same event. Be conservative with confidence. Political allegations, polls, campaign claims and institutional self-praise are claims, not facts. Election statuses (aspirant, precandidate, candidate) must be exact.\n\nTOPICS:\n${topics.map(t => `- ${t.code}: ${t.name} (${t.priority})`).join('\n')}\n\nPROFILES:\n${profiles.map(p => `- ${p.code}: ${p.name} [${p.profile_type}]`).join('\n')}\n\nPREFERRED SOURCES:\n${sources.map(s => `- ${s.name} (${s.domain || 'n/a'})`).join('\n')}\n\nReturn ONLY valid JSON with this exact top-level shape:\n{\n  "stories": [\n    {\n      "title": "working headline",\n      "summary": "2-4 sentence factual summary",\n      "scope": "state|municipal|national|international",\n      "importance_score": 0.0,\n      "confidence_score": 0.0,\n      "relevance_score": 0.0,\n      "priority": "P0|P1|P2|P3|P4",\n      "is_electoral": false,\n      "topics": [{"code":"NL-Txx","name":"...","score":0.0}],\n      "profiles": [{"code":"NL-Pxxx","name":"...","relation":"mentioned|subject|related","score":0.0}],\n      "sources": [{"name":"...","url":"https://...","tier":"A|B|C|D","primary":true}],\n      "claims": [{"text":"...","status":"verified|supported|unverified|contradicted","confidence":0.0,"attribution":"..."}],\n      "recommended_angle": "...",\n      "recommended_format": "article|breaking|brief|analysis|explainer"\n    }\n  ]\n}\nReturn at most 15 stories. Every story must include at least one real source URL discovered on the web.`;

  const response = await openai.responses.create({
    model: env.openaiModel,
    tools: [{ type: 'web_search' } as any],
    input: prompt,
  });
  const parsed = extractJson(response.output_text || '{"stories":[]}');
  const stories = Array.isArray(parsed.stories) ? parsed.stories : [];
  const saved: any[] = [];

  for (const s of stories) {
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

    await query(`INSERT INTO story_territories(story_id,territory_brain_id,relevance_score,local_angle) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [story.id, brain.id, clamp(s.relevance_score), s.recommended_angle || null]);

    for (const t of (s.topics || [])) {
      const topic = await one<any>('SELECT id FROM topics WHERE territory_brain_id=$1 AND (code=$2 OR lower(name)=lower($3)) LIMIT 1', [brain.id, t.code || '', t.name || '']);
      if (topic) await query('INSERT INTO story_topics(story_id,topic_id,relevance_score) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [story.id, topic.id, clamp(t.score)]);
    }
    for (const p of (s.profiles || [])) {
      const profile = await one<any>('SELECT id FROM profiles WHERE territory_brain_id=$1 AND (code=$2 OR lower(name)=lower($3)) LIMIT 1', [brain.id, p.code || '', p.name || '']);
      if (profile) await query('INSERT INTO story_profiles(story_id,profile_id,relation,relevance_score) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [story.id, profile.id, p.relation || 'related', clamp(p.score)]);
    }
    for (const source of (s.sources || [])) {
      if (!source?.name) continue;
      await query('INSERT INTO story_sources(story_id,source_name,source_url,source_tier,is_primary) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [story.id, source.name, source.url || '', source.tier || 'B', !!source.primary]);
    }
    for (const c of (s.claims || [])) {
      await query('INSERT INTO story_claims(story_id,claim_text,claim_type,verification_status,confidence_score,attribution) VALUES($1,$2,$3,$4,$5,$6)', [story.id, c.text || '', s.is_electoral ? 'electoral_claim' : 'fact', c.status || 'unverified', clamp(c.confidence), c.attribution || null]);
    }

    const rel = clamp(s.relevance_score);
    const priorityLabel = rel >= .9 ? 'CRITICAL' : rel >= .75 ? 'HIGH' : rel >= .6 ? 'MEDIUM' : rel >= .4 ? 'LOW' : 'IGNORE';
    await query(`INSERT INTO identity_story_scores(story_id,identity_id,territory_score,topic_score,profile_score,national_feed_score,editorial_priority_score,relevance_score,priority_label,recommended_angle,recommended_format,decision)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(story_id,identity_id) DO UPDATE SET relevance_score=EXCLUDED.relevance_score,priority_label=EXCLUDED.priority_label,recommended_angle=EXCLUDED.recommended_angle,recommended_format=EXCLUDED.recommended_format,decision=EXCLUDED.decision,scored_at=now()`, [
      story.id, identity.id, rel, rel, rel, s.scope === 'national' ? rel : 0, clamp(s.importance_score), rel, priorityLabel, s.recommended_angle || '', s.recommended_format || 'article', rel >= .6 ? 'PUBLISH' : 'WATCH'
    ]);
    saved.push({ ...story, priority: s.priority || 'P2', relevance_score: rel, confidence_score: clamp(s.confidence_score), is_electoral: !!s.is_electoral });
  }
  return saved;
}
