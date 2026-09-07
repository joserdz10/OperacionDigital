import { one, query } from '../db.js';

export async function inbox(identityCode: string, limit = 12) {
  return query<any>(`
    SELECT s.id,s.story_number,s.title,s.summary,s.confidence_score,s.importance_score,s.first_detected_at,
           iss.relevance_score,iss.priority_label,iss.decision,iss.recommended_format,
           EXISTS(SELECT 1 FROM story_topics st JOIN topics t ON t.id=st.topic_id WHERE st.story_id=s.id AND t.topic_type='electoral_process') is_electoral
    FROM identity_story_scores iss
    JOIN stories s ON s.id=iss.story_id
    JOIN identities i ON i.id=iss.identity_id
    WHERE i.code=$1 AND iss.decision <> 'IGNORE'
    ORDER BY iss.relevance_score DESC,s.first_detected_at DESC LIMIT $2`, [identityCode, limit]);
}

export async function findStory(identityCode: string, ref: string | undefined, lastStoryId?: string | null) {
  if (!ref && lastStoryId) ref = lastStoryId;
  if (!ref) return null;
  const isNumber = /^\d+$/.test(ref);
  return one<any>(`
    SELECT s.*,iss.relevance_score,iss.priority_label,iss.decision,iss.recommended_angle,iss.recommended_format,i.name identity_name,i.id identity_id
    FROM stories s
    JOIN identity_story_scores iss ON iss.story_id=s.id
    JOIN identities i ON i.id=iss.identity_id
    WHERE i.code=$1 AND ${isNumber ? 's.story_number=$2::bigint' : 's.id=$2::uuid'} LIMIT 1`, [identityCode, ref]);
}

export async function storyDetail(storyId: string) {
  const [topics, profiles, sources, claims] = await Promise.all([
    query<any>('SELECT t.code,t.name,st.relevance_score FROM story_topics st JOIN topics t ON t.id=st.topic_id WHERE st.story_id=$1 ORDER BY st.relevance_score DESC', [storyId]),
    query<any>('SELECT p.code,p.name,sp.relation,sp.relevance_score FROM story_profiles sp JOIN profiles p ON p.id=sp.profile_id WHERE sp.story_id=$1 ORDER BY sp.relevance_score DESC', [storyId]),
    query<any>('SELECT source_name,source_url,source_tier,is_primary FROM story_sources WHERE story_id=$1 ORDER BY is_primary DESC,source_name', [storyId]),
    query<any>('SELECT claim_text,verification_status,confidence_score,attribution FROM story_claims WHERE story_id=$1 ORDER BY confidence_score DESC', [storyId]),
  ]);
  return { topics, profiles, sources, claims };
}
