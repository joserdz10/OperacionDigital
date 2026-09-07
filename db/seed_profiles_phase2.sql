-- Phase 2 profiles: political leadership and core topic relations.
INSERT INTO profiles (territory_brain_id, code, profile_type, name, slug, description, current_roles, importance, aliases)
SELECT b.id, 'NL-P13','person','Samuel Alejandro Garcia Sepulveda','samuel-garcia-sepulveda',
       'Gobernador Constitucional del Estado de Nuevo Leon, administracion 2021-2027.',
       '[{"role":"Gobernador Constitucional","institution":"Gobierno de Nuevo Leon","start":"2021","end":"2027"}]'::jsonb,
       1.0,
       '["Samuel Garcia","Samuel Garcia Sepulveda"]'::jsonb
FROM territory_brains b WHERE b.code='BR-MX-NL'
ON CONFLICT (code) DO UPDATE SET description=EXCLUDED.description, current_roles=EXCLUDED.current_roles, importance=EXCLUDED.importance;

INSERT INTO profile_topics (profile_id, topic_id, relation_type, weight)
SELECT p.id, t.id, 'governs', x.weight
FROM profiles p
JOIN (VALUES
('NL-T01',1.0),('NL-T02',0.95),('NL-T05',0.85),('NL-T07',0.90),('NL-T08',0.90),('NL-T10',0.85),
('NL-T13',0.90),('NL-T14',0.80),('NL-T15',0.80),('NL-T20',0.90),('NL-T21',0.80),('NL-T22',0.70)
) AS x(topic_code,weight) ON true
JOIN topics t ON t.code=x.topic_code
WHERE p.code='NL-P13'
ON CONFLICT (profile_id,topic_id) DO UPDATE SET weight=EXCLUDED.weight;

INSERT INTO profile_topics (profile_id, topic_id, relation_type, weight)
SELECT p.id, t.id, 'institutional', x.weight
FROM profiles p
JOIN (VALUES
('NL-T01',1.0),('NL-T07',0.90),('NL-T08',0.90),('NL-T10',0.90),('NL-T13',0.90),('NL-T14',0.80),('NL-T15',0.80),('NL-T20',0.90),('NL-T21',0.85)
) AS x(topic_code,weight) ON true
JOIN topics t ON t.code=x.topic_code
WHERE p.code='NL-P01'
ON CONFLICT (profile_id,topic_id) DO UPDATE SET weight=EXCLUDED.weight;
