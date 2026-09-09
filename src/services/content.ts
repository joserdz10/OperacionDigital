import { env } from '../config/env.js';
import { one, query } from '../db.js';
import { openai, extractJson } from './openai.js';
import { storyDetail } from './stories.js';

function asText(value: any) {
  return typeof value === 'string' ? value : JSON.stringify(value || {}, null, 2);
}

export async function generateBundle(story: any, kind = 'todo') {
  const details = await storyDetail(story.id);
  const mediaDna = await one<any>('SELECT * FROM media_dna WHERE identity_id=$1 AND is_current=true ORDER BY version DESC LIMIT 1', [story.identity_id]);
  const visualDna = await one<any>('SELECT * FROM visual_dna WHERE identity_id=$1 AND is_current=true ORDER BY version DESC LIMIT 1', [story.identity_id]);
  const safeClaims = details.claims.filter((c: any) => ['verified', 'supported'].includes(c.verification_status));
  const riskyClaims = details.claims.filter((c: any) => !['verified', 'supported'].includes(c.verification_status));

  const prompt = `You are the Content Generator for AI Media Network. Write in Spanish for identity ${story.identity_name}.
Requested output: ${kind}.

MEDIA DNA:
${JSON.stringify(mediaDna)}

VISUAL DNA:
${JSON.stringify(visualDna)}

STORY:
${JSON.stringify({ title: story.title, summary: story.summary, relevance: story.relevance_score, confidence: story.confidence_score, recommended_angle: story.recommended_angle })}

TOPICS:
${JSON.stringify(details.topics)}
PROFILES:
${JSON.stringify(details.profiles)}
SUPPORTED FACT PACK:
${JSON.stringify(safeClaims)}
RISKY/UNVERIFIED CLAIMS (do not state as fact; only attribute if editorially necessary):
${JSON.stringify(riskyClaims)}
SOURCES:
${JSON.stringify(details.sources)}

Rules: never invent numbers, names, dates or quotes. Separate news from opinion. For electoral content preserve exact status (aspirant/precandidate/candidate) and attribute polls/allegations. Norte En Alerta style is serious, clear, regional, contextual, very low clickbait.
Visual metadata: when a municipality is explicitly supported by the Story, put it in location (for example APODACA, SAN PEDRO, MONTERREY). Put the editorial section in section (for example SEGURIDAD, MOVILIDAD, POLÍTICA). Do not repeat NUEVO LEÓN | NUEVO LEÓN. Canvas sizes are fixed by the renderer: feed 1080x1350, story/reel 1080x1920, square 1080x1080.

Return ONLY valid JSON:
{
  "headline":"",
  "subheadline":"",
  "article":"",
  "facebook":"",
  "instagram":"",
  "x":"",
  "visuals": {
    "fb": {"template":"NEA_FEED_POST","size":"1080x1350","location":"","section":"","headline":"","subheadline":"","image_direction":"","footer":"","notes":""},
    "story": {"template":"NEA_STORY_9X16","size":"1080x1920","location":"","section":"","headline":"","secondary":"","cta":"Conoce los detalles","notes":""},
    "reel": {"template":"NEA_REEL_COVER","size":"1080x1920","location":"","section":"","headline":"","subheadline":"","notes":""},
    "square": {"template":"NEA_SQUARE_POST","size":"1080x1080","location":"","section":"","headline":"","subheadline":"","notes":""},
    "breaking": {"template":"NEA_BREAKING_POST","size":"1080x1350","location":"","section":"","headline":"","subheadline":"","notes":""},
    "quote": {"template":"NEA_QUOTE_POST","size":"1080x1350","headline":"","quote":"","attribution":"","notes":""},
    "carousel": {"template":"NEA_CAROUSEL","size":"1080x1350","location":"","section":"","cover_headline":"","slides":[{"headline":"","body":""}],"notes":""}
  },
  "reel_scripts": {"hook":"","script_20s":"","script_40s":""},
  "source_attribution": ["..."]
}`;

  const response = await openai.responses.create({ model: env.openaiModel, input: prompt });
  const bundle = extractJson(response.output_text || '{}');
  const visuals = bundle.visuals || {};

  const contentRows: [string, string, string, string][] = [
    ['article', 'web', bundle.headline || '', bundle.article || ''],
    ['facebook', 'social', '', bundle.facebook || ''],
    ['instagram', 'social', '', bundle.instagram || ''],
    ['x', 'social', '', bundle.x || ''],
    ['graphic', 'fb', visuals.fb?.headline || bundle.headline || '', asText(visuals.fb)],
    ['graphic', 'ig', visuals.fb?.headline || bundle.headline || '', asText(visuals.fb)],
    ['graphic', 'post', visuals.fb?.headline || bundle.headline || '', asText(visuals.fb)],
    ['story', 'story', visuals.story?.headline || bundle.headline || '', asText(visuals.story)],
    ['reel', 'reel', visuals.reel?.headline || bundle.headline || '', asText(visuals.reel)],
    ['graphic', 'square', visuals.square?.headline || bundle.headline || '', asText(visuals.square)],
    ['graphic', 'breaking', visuals.breaking?.headline || bundle.headline || '', asText(visuals.breaking)],
    ['graphic', 'quote', visuals.quote?.headline || bundle.headline || '', asText(visuals.quote)],
    ['graphic', 'carousel', visuals.carousel?.cover_headline || bundle.headline || '', asText(visuals.carousel)],
    ['reel', 'vertical', bundle.reel_scripts?.hook || '', asText(bundle.reel_scripts || {})],
  ];

  for (const [type, format, headline, body] of contentRows) {
    await query(`INSERT INTO content_pieces(story_id,identity_id,content_type,format,headline,body,status,generation_model,media_dna_version,visual_dna_version,source_snapshot)
      VALUES($1,$2,$3,$4,$5,$6,'content_ready',$7,$8,$9,$10::jsonb)`, [story.id, story.identity_id, type, format, headline, body, env.openaiModel, mediaDna?.version || null, visualDna?.version || null, JSON.stringify(details.sources)]);
  }

  return bundle;
}
