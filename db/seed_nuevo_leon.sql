-- Nuevo Leon is configuration/seed data for the shared national engine, not state-specific code.

INSERT INTO identities (territory_brain_id, code, name, working_name, slug, identity_type, positioning, audience, status)
SELECT b.id, x.code, x.name, x.name, x.slug, x.identity_type, x.positioning, x.audience, x.status
FROM territory_brains b
CROSS JOIN (VALUES
('NL-01','Norte En Alerta','norte-en-alerta','generalist','Cabecera generalista regional: Nuevo Leon, con contexto.','Publico general que busca informacion confiable y contextual de Nuevo Leon.','active'),
('NL-02','Codigo Regio','codigo-regio','generalist','Generalista digital, agil y social-first.','Audiencia digital y social.','draft'),
('NL-03','Punto Norte','punto-norte','generalist','Generalista analitico y premium.','Profesionales, ejecutivos y lectores de contexto.','draft'),
('NL-04','Circulo Politico NL','circulo-politico-nl','politics','Politica, poder y asuntos publicos.','Audiencia de politica y gobierno.','draft'),
('NL-05','Zona Regia','zona-regia','sports','Deportes de Nuevo Leon con energia y datos.','Aficion deportiva.','draft'),
('NL-06','Norte Capital','norte-capital','business','Negocios, industria, inversion y economia.','Empresarios, ejecutivos y sector B2B.','draft')
) AS x(code,name,slug,identity_type,positioning,audience,status)
WHERE b.code='BR-MX-NL'
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, working_name=EXCLUDED.working_name, slug=EXCLUDED.slug, status=EXCLUDED.status;

INSERT INTO media_dna (identity_id, mission, tone, writing_style, headline_style, editorial_priorities, content_mix, national_policy, emoji_policy, clickbait_level, fact_check_policy, source_policy)
SELECT i.id,
'Informar Nuevo Leon con rigor, contexto y vocacion de servicio.',
'["serio","claro","editorial","regional","contemporaneo"]'::jsonb,
'{"context_level":0.95,"sensationalism":0.05,"speed":0.80,"depth":0.70,"institutionality":0.75}'::jsonb,
'informative_contextual',
'{"government":1.0,"security":1.0,"mobility":1.0,"water":1.0,"investment":0.95,"politics":0.9,"municipalities":0.9}'::jsonb,
'{"local":0.65,"national":0.25,"international":0.10}'::jsonb,
'{"inherit_national":true,"local_impact_bonus":0.25}'::jsonb,
'minimal','very-low',
'{"require_traceability":true,"separate_fact_claim_opinion":true,"election_status_precision":true}'::jsonb,
'{"prefer_primary_sources":true,"cross_check_high_risk_claims":true}'::jsonb
FROM identities i WHERE i.code='NL-01'
AND NOT EXISTS (SELECT 1 FROM media_dna m WHERE m.identity_id=i.id AND m.version=1);

INSERT INTO visual_dna (identity_id, visual_family, brand_personality, colors, typography, photo_style, graphic_style, footer_style, motion_style)
SELECT i.id,'regional-generalist-editorial',
'["editorial","confiable","limpio","regional"]'::jsonb,
'{"primary":"#143E3B","secondary":"#F4F0E8","accent":"#B9754E","neutral":"#3C3C3C"}'::jsonb,
'{"headline":"editorial-serif","body":"clean-sans"}'::jsonb,
'{"mode":"documentary_clean","prefer_real_event_photo":true}'::jsonb,
'{"feed_master":"1080x1350","square":"1080x1080","vertical":"1080x1920"}'::jsonb,
'{"style":"nea_official"}'::jsonb,
'{"style":"restrained_editorial"}'::jsonb
FROM identities i WHERE i.code='NL-01'
AND NOT EXISTS (SELECT 1 FROM visual_dna v WHERE v.identity_id=i.id AND v.version=1);

INSERT INTO topics (territory_brain_id, code, name, slug, topic_type, priority, semantic_queries, related_terms)
SELECT b.id,t.code,t.name,t.slug,t.topic_type,t.priority,t.semantic_queries::jsonb,t.related_terms::jsonb
FROM territory_brains b CROSS JOIN (VALUES
('NL-T01','Gobierno de Nuevo Leon','gobierno-nuevo-leon','government',1.00,'["acciones del Gobierno de Nuevo Leon","programas publicos estatales","politicas publicas Nuevo Leon"]','["Gobierno NL","administracion estatal"]'),
('NL-T02','Politica Nuevo Leon','politica-nuevo-leon','politics',0.90,'["politica de Nuevo Leon","partidos Nuevo Leon","agenda politica estatal"]','[]'),
('NL-T03','Congreso Nuevo Leon','congreso-nuevo-leon','institution',0.85,'["Congreso de Nuevo Leon","diputados locales","legislacion estatal"]','[]'),
('NL-T04','Municipios Nuevo Leon','municipios-nuevo-leon','municipal',0.90,'["municipios de Nuevo Leon","ayuntamientos Nuevo Leon"]','[]'),
('NL-T05','Relacion Federacion-Nuevo Leon','federacion-nuevo-leon','politics',0.85,'["Gobierno federal y Nuevo Leon","Federacion Nuevo Leon"]','[]'),
('NL-T06','Elecciones Nuevo Leon','elecciones-nuevo-leon','elections',0.90,'["elecciones Nuevo Leon","proceso electoral Nuevo Leon"]','[]'),
('NL-T07','Movilidad','movilidad','infrastructure',1.00,'["movilidad metropolitana de Monterrey","transporte Nuevo Leon","trafico Monterrey"]','[]'),
('NL-T08','Metro de Monterrey','metro-monterrey','infrastructure',1.00,'["Metro de Monterrey","Metrorrey","lineas del Metro"]','[]'),
('NL-T09','Transporte Publico','transporte-publico','infrastructure',0.95,'["rutas urbanas Nuevo Leon","transporte publico Monterrey"]','[]'),
('NL-T10','Obra Publica','obra-publica','infrastructure',0.95,'["obra publica Nuevo Leon","infraestructura estatal"]','[]'),
('NL-T11','Desarrollo Urbano','desarrollo-urbano','urban',0.80,'["desarrollo urbano Monterrey","crecimiento metropolitano"]','[]'),
('NL-T12','Carreteras','carreteras','infrastructure',0.85,'["carreteras Nuevo Leon","vialidades Nuevo Leon"]','[]'),
('NL-T13','Inversion','inversion','business',0.95,'["nueva inversion Nuevo Leon","empresas que llegan a Nuevo Leon","inversion extranjera Nuevo Leon"]','[]'),
('NL-T14','Industria','industria','business',0.85,'["industria Nuevo Leon","manufactura Nuevo Leon"]','[]'),
('NL-T15','Nearshoring','nearshoring','business',0.75,'["nearshoring Nuevo Leon","relocalizacion de empresas","cadenas de suministro"]','[]'),
('NL-T16','Empresas','empresas','business',0.80,'["empresas Nuevo Leon","corporativos Monterrey"]','[]'),
('NL-T17','Empleo','empleo','economy',0.85,'["empleo Nuevo Leon","mercado laboral Nuevo Leon"]','[]'),
('NL-T18','Real Estate','real-estate','business',0.60,'["real estate Nuevo Leon","desarrollos inmobiliarios Monterrey"]','[]'),
('NL-T19','Tecnologia','tecnologia','technology',0.65,'["tecnologia Nuevo Leon","startups Monterrey","innovacion Nuevo Leon"]','[]'),
('NL-T20','Seguridad','seguridad','security',1.00,'["seguridad publica Nuevo Leon","Fuerza Civil","operativos de seguridad","delitos Nuevo Leon"]','[]'),
('NL-T21','Agua','agua','society',1.00,'["abastecimiento de agua Nuevo Leon","presas Nuevo Leon","sequía Nuevo Leon","Agua y Drenaje"]','["AyD","Servicios de Agua y Drenaje de Monterrey"]'),
('NL-T22','Medio Ambiente','medio-ambiente','environment',0.85,'["calidad del aire Nuevo Leon","contaminacion Monterrey","incendios Nuevo Leon"]','[]'),
('NL-T23','Tigres','tigres','sports',0.55,'["Tigres UANL","Tigres futbol"]','[]'),
('NL-T24','Rayados','rayados','sports',0.55,'["Rayados Monterrey","Club de Futbol Monterrey"]','[]'),
('NL-T25','Proceso Electoral Nuevo Leon 2026-2027','proceso-electoral-nuevo-leon-2026-2027','electoral_process',1.00,'["proceso electoral Nuevo Leon 2026 2027","gubernatura Nuevo Leon 2027","ayuntamientos 2027 Nuevo Leon","diputaciones Nuevo Leon 2027","precampanas campanas debates encuestas IEEPCNL"]','["IEEPCNL","INE","TEPJF","Tribunal Electoral Nuevo Leon","gubernatura 2027"]')
) AS t(code,name,slug,topic_type,priority,semantic_queries,related_terms)
WHERE b.code='BR-MX-NL'
ON CONFLICT (code) DO UPDATE SET priority=EXCLUDED.priority, semantic_queries=EXCLUDED.semantic_queries, related_terms=EXCLUDED.related_terms;

INSERT INTO profiles (territory_brain_id, code, profile_type, name, slug, description, aliases, current_roles, importance, metadata)
SELECT b.id,p.code,p.profile_type,p.name,p.slug,p.description,p.aliases::jsonb,p.roles::jsonb,p.importance,p.metadata::jsonb
FROM territory_brains b CROSS JOIN (VALUES
('NL-P001','government','Gobierno de Nuevo Leon','gobierno-nuevo-leon','Gobierno estatal','["Gobierno NL"]','[]',1.00,'{}'),
('NL-P002','person','Samuel Garcia Sepulveda','samuel-garcia','Gobernador de Nuevo Leon','["Samuel Garcia","Samuel Garcia Sepulveda","Gobernador de Nuevo Leon"]','[{"role":"Gobernador Constitucional de Nuevo Leon","current":true}]',1.00,'{"monitor_priority":"critical"}'),
('NL-P003','institution','Congreso del Estado de Nuevo Leon','congreso-nl','Poder Legislativo estatal','["Congreso NL"]','[]',0.90,'{}'),
('NL-P004','institution','Fuerza Civil','fuerza-civil','Corporacion estatal de seguridad','[]','[]',0.90,'{}'),
('NL-P005','institution','Proteccion Civil Nuevo Leon','proteccion-civil-nl','Proteccion Civil estatal','[]','[]',0.95,'{}'),
('NL-P006','institution','Servicios de Agua y Drenaje de Monterrey','agua-y-drenaje','Operador de agua y drenaje','["AyD","Agua y Drenaje"]','[]',0.90,'{}'),
('NL-P007','institution','Metrorrey','metrorrey','Sistema de transporte Metro','[]','[]',0.90,'{}'),
('NL-P020','municipality','Monterrey','monterrey','Municipio de Monterrey','[]','[]',0.95,'{}'),
('NL-P021','municipality','San Pedro Garza Garcia','san-pedro-garza-garcia','Municipio de San Pedro','["San Pedro"]','[]',0.85,'{}'),
('NL-P022','municipality','Guadalupe','guadalupe-nl','Municipio de Guadalupe','[]','[]',0.85,'{}'),
('NL-P023','municipality','Apodaca','apodaca','Municipio de Apodaca','[]','[]',0.85,'{}'),
('NL-P024','municipality','General Escobedo','general-escobedo','Municipio de Escobedo','["Escobedo"]','[]',0.85,'{}'),
('NL-P025','municipality','Santa Catarina','santa-catarina-nl','Municipio de Santa Catarina','[]','[]',0.80,'{}'),
('NL-P026','municipality','Garcia','garcia-nl','Municipio de Garcia','[]','[]',0.80,'{}'),
('NL-P100','sports_team','Tigres UANL','tigres-uanl','Equipo deportivo','["Tigres"]','[]',0.55,'{}'),
('NL-P101','sports_team','Club de Futbol Monterrey','rayados-monterrey','Equipo deportivo','["Rayados","CF Monterrey"]','[]',0.55,'{}'),
('NL-PRJ001','project','Metro Linea 4','metro-linea-4','Proyecto de movilidad','["Linea 4"]','[]',0.90,'{}'),
('NL-PRJ002','project','Metro Linea 6','metro-linea-6','Proyecto de movilidad','["Linea 6"]','[]',0.95,'{}')
) AS p(code,profile_type,name,slug,description,aliases,roles,importance,metadata)
WHERE b.code='BR-MX-NL'
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, aliases=EXCLUDED.aliases, current_roles=EXCLUDED.current_roles, importance=EXCLUDED.importance, metadata=EXCLUDED.metadata;

INSERT INTO sources (territory_brain_id, name, domain, source_type, territory_scope, reliability_score, monitor_enabled, metadata)
SELECT b.id,s.name,s.domain,s.source_type,s.scope,s.reliability,true,s.metadata::jsonb
FROM territory_brains b CROSS JOIN (VALUES
('Gobierno de Nuevo Leon','nl.gob.mx','government','state',0.95,'{"tier":"A","priority":1.0,"base_url":"https://www.nl.gob.mx/es/noticias"}'),
('Congreso de Nuevo Leon','hcnl.gob.mx','government','state',0.95,'{"tier":"A","priority":0.95,"base_url":"https://www.hcnl.gob.mx/sala_de_prensa/"}'),
('Proteccion Civil Nuevo Leon','nl.gob.mx','government','state',0.95,'{"tier":"A","priority":1.0}'),
('Gobierno de Monterrey','monterrey.gob.mx','government','municipal',0.92,'{"tier":"A","priority":0.95}'),
('Gobierno de San Pedro','sanpedro.gob.mx','government','municipal',0.90,'{"tier":"A","priority":0.85}'),
('Gobierno de Guadalupe','guadalupe.gob.mx','government','municipal',0.90,'{"tier":"A","priority":0.85}'),
('Gobierno de Apodaca','apodaca.gob.mx','government','municipal',0.90,'{"tier":"A","priority":0.85}'),
('Gobierno de Escobedo','escobedo.gob.mx','government','municipal',0.90,'{"tier":"A","priority":0.85}'),
('Metrorrey','metrorrey.mx','government','state',0.95,'{"tier":"A","priority":0.95}'),
('IEEPCNL','ieepcnl.mx','electoral_authority','state',0.98,'{"tier":"A","priority":1.0,"election":true}'),
('INE','ine.mx','electoral_authority','national',0.98,'{"tier":"A","priority":1.0,"election":true}'),
('TEPJF','te.gob.mx','electoral_authority','national',0.98,'{"tier":"A","priority":0.95,"election":true}')
) AS s(name,domain,source_type,scope,reliability,metadata)
WHERE b.code='BR-MX-NL'
AND NOT EXISTS (SELECT 1 FROM sources z WHERE z.territory_brain_id=b.id AND z.name=s.name);

INSERT INTO identity_topic_subscriptions (identity_id, topic_id, priority, editorial_lens, auto_generate, auto_publish)
SELECT i.id,t.id,
CASE t.code
WHEN 'NL-T01' THEN 1.00 WHEN 'NL-T20' THEN 1.00 WHEN 'NL-T07' THEN 1.00 WHEN 'NL-T08' THEN 1.00 WHEN 'NL-T21' THEN 1.00
WHEN 'NL-T25' THEN 1.00 WHEN 'NL-T13' THEN 0.95 WHEN 'NL-T10' THEN 0.95 WHEN 'NL-T04' THEN 0.90 WHEN 'NL-T02' THEN 0.90
WHEN 'NL-T03' THEN 0.85 WHEN 'NL-T05' THEN 0.85 WHEN 'NL-T22' THEN 0.85 WHEN 'NL-T17' THEN 0.85 WHEN 'NL-T14' THEN 0.85
WHEN 'NL-T15' THEN 0.75 WHEN 'NL-T19' THEN 0.65 WHEN 'NL-T18' THEN 0.60 WHEN 'NL-T23' THEN 0.55 WHEN 'NL-T24' THEN 0.55 ELSE 0.75 END,
'{"mode":"informative_contextual","focus":["facts","impact","context"],"election_mode":"precise_status_and_attribution"}'::jsonb,
true,false
FROM identities i JOIN territory_brains b ON b.id=i.territory_brain_id CROSS JOIN topics t
WHERE i.code='NL-01' AND b.code='BR-MX-NL' AND t.territory_brain_id=b.id
ON CONFLICT (identity_id,topic_id) DO UPDATE SET priority=EXCLUDED.priority, editorial_lens=EXCLUDED.editorial_lens;

INSERT INTO national_feed_policies (identity_id, politics_weight, economy_weight, security_weight, society_weight, sports_weight, entertainment_weight, technology_weight)
SELECT id,0.85,0.75,0.90,0.80,0.50,0.25,0.50 FROM identities WHERE code='NL-01'
ON CONFLICT (identity_id) DO UPDATE SET politics_weight=0.85,economy_weight=0.75,security_weight=0.90,society_weight=0.80,sports_weight=0.50,entertainment_weight=0.25,technology_weight=0.50,updated_at=now();
