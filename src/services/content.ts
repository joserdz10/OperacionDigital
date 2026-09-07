import { env } from '../config/env.js';
import { one, query } from '../db.js';
import { openai, extractJson } from './openai.js';
import { storyDetail } from './stories.js';

export async function generateBundle(story: any, kind = 'todo') {
  const details = await storyDetail(story.id);
  const mediaDna = await one<any>('SELECT * FROM media_dna WHERE identity_id=$1 AND is_current=true ORDER BY version DESC LIMIT 1', [story.identity_id]);
  const visualDna = await one<any>('SELECT * FROM visual_dna WHERE identity_id=$1 AND is_current=true ORDER BY version DESC LIMIT 1', [story.identity_id]);
  const safeClaims = details.claims.filter((c: any) => ['verified','supported'].includes(c.verification_status));
  const riskyClaims = details.claims.filter((c: any) => !['verified','supported'].includes(c.verification_status));

  const prompt = `You are the Content Generator for AI Media Network. Write in Spanish for identity ${story.identity_name}.\nRequested output: ${kind}.\n\nMEDIA DNA:\n${JSON.stringify(mediaDna)}\n\nSTORY:\n${JSON.stringify({title:story.title,summary:story.summary,relevance:story.relevance_score,confidence:story.confidence_score,recommended_angle:story.recommended_angle})}\n\nTOPICS:\n${JSON.stringify(details.topics)}\nPROFILES:\n${JSON.stringify(details.profiles)}\nSUPPORTED FACT PACK:\n${JSON.stringify(safeClaims)}\nRISKY/UNVERIFIED CLAIMS (do not state as fact; only attribute if editorially necessary):\n${JSON.stringify(riskyClaims)}\nSOURCES:\n${JSON.stringify(details.sources)}\n\nRules: never invent numbers, names, dates or quotes. Separate news from opinion. For electoral content preserve exact status (aspirant/precandidate/candidate) and attribute polls/allegations. Norte En Alerta style is serious, clear, regional, contextual, very low clickbait.\n\nReturn ONLY valid JSON:\n{\n "headline":"", "subheadline":"", "article":"", "facebook":"", "instagram":"", "x":"",\n "graphic_4x5":{"template":"NEA_MAIN_4X5","section":"","headline":"","subheadline":""},\n "story_9x16":{"headline":"","data":"","secondary":"","cta":"Conoce los detalles"},\n "reel":{"hook":"","script_20s":"","script_40s":""},\n "source_attribution":["..."]\n}`;

  const response = await openai.responses.create({ model: env.openaiModel, input: prompt });
  const bundle = extractJson(response.output_text || '{}');
  const contentRows: [string,string,string,string][] = [
    ['article','web',bundle.headline || '',bundle.article || ''],
    ['facebook','social','',bundle.facebook || ''],
    ['instagram','social','',bundle.instagram || ''],
    ['x','social','',bundle.x || ''],
    ['graphic','4:5',bundle.graphic_4x5?.headline || '',JSON.stringify(bundle.graphic_4x5 || {})],
    ['story','9:16',bundle.story_9x16?.headline || '',JSON.stringify(bundle.story_9x16 || {})],
    ['reel','vertical',bundle.reel?.hook || '',JSON.stringify(bundle.reel || {})],
  ];
  for (const [type, format, headline, body] of contentRows) {
    await query(`INSERT INTO content_pieces(story_id,identity_id,content_type,format,headline,body,status,generation_model,media_dna_version,visual_dna_version,source_snapshot)
      VALUES($1,$2,$3,$4,$5,$6,'content_ready',$7,$8,$9,$10::jsonb)`, [story.id,story.identity_id,type,format,headline,body,env.openaiModel,mediaDna?.version || null,visualDna?.version || null,JSON.stringify(details.sources)]);
  }
  return bundle;
}
