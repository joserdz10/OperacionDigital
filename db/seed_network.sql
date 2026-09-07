INSERT INTO territory_brains (code, brain_type, country_code, name, slug, timezone, status)
VALUES ('BR-MX','national','MX','Mexico','mexico','America/Mexico_City','active')
ON CONFLICT (code) DO NOTHING;

WITH n AS (SELECT id FROM territory_brains WHERE code='BR-MX')
INSERT INTO territory_brains (parent_brain_id, code, brain_type, country_code, state_code, name, slug, timezone, status)
SELECT n.id, x.code, 'state', 'MX', x.state_code, x.name, x.slug, x.timezone,
       CASE WHEN x.code='BR-MX-NL' THEN 'active' ELSE 'inactive' END
FROM n
CROSS JOIN (VALUES
('BR-MX-AGU','AGU','Aguascalientes','aguascalientes','America/Mexico_City'),
('BR-MX-BC','BC','Baja California','baja-california','America/Tijuana'),
('BR-MX-BCS','BCS','Baja California Sur','baja-california-sur','America/Mazatlan'),
('BR-MX-CAM','CAM','Campeche','campeche','America/Merida'),
('BR-MX-CHP','CHP','Chiapas','chiapas','America/Mexico_City'),
('BR-MX-CHH','CHH','Chihuahua','chihuahua','America/Chihuahua'),
('BR-MX-CMX','CMX','Ciudad de Mexico','ciudad-de-mexico','America/Mexico_City'),
('BR-MX-COA','COA','Coahuila','coahuila','America/Monterrey'),
('BR-MX-COL','COL','Colima','colima','America/Mexico_City'),
('BR-MX-DUR','DUR','Durango','durango','America/Monterrey'),
('BR-MX-GUA','GUA','Guanajuato','guanajuato','America/Mexico_City'),
('BR-MX-GRO','GRO','Guerrero','guerrero','America/Mexico_City'),
('BR-MX-HID','HID','Hidalgo','hidalgo','America/Mexico_City'),
('BR-MX-JAL','JAL','Jalisco','jalisco','America/Mexico_City'),
('BR-MX-MEX','MEX','Estado de Mexico','estado-de-mexico','America/Mexico_City'),
('BR-MX-MIC','MIC','Michoacan','michoacan','America/Mexico_City'),
('BR-MX-MOR','MOR','Morelos','morelos','America/Mexico_City'),
('BR-MX-NAY','NAY','Nayarit','nayarit','America/Mazatlan'),
('BR-MX-NL','NL','Nuevo Leon','nuevo-leon','America/Monterrey'),
('BR-MX-OAX','OAX','Oaxaca','oaxaca','America/Mexico_City'),
('BR-MX-PUE','PUE','Puebla','puebla','America/Mexico_City'),
('BR-MX-QUE','QUE','Queretaro','queretaro','America/Mexico_City'),
('BR-MX-ROO','ROO','Quintana Roo','quintana-roo','America/Cancun'),
('BR-MX-SLP','SLP','San Luis Potosi','san-luis-potosi','America/Mexico_City'),
('BR-MX-SIN','SIN','Sinaloa','sinaloa','America/Mazatlan'),
('BR-MX-SON','SON','Sonora','sonora','America/Hermosillo'),
('BR-MX-TAB','TAB','Tabasco','tabasco','America/Mexico_City'),
('BR-MX-TAM','TAM','Tamaulipas','tamaulipas','America/Monterrey'),
('BR-MX-TLA','TLA','Tlaxcala','tlaxcala','America/Mexico_City'),
('BR-MX-VER','VER','Veracruz','veracruz','America/Mexico_City'),
('BR-MX-YUC','YUC','Yucatan','yucatan','America/Merida'),
('BR-MX-ZAC','ZAC','Zacatecas','zacatecas','America/Mexico_City')
) AS x(code,state_code,name,slug,timezone)
ON CONFLICT (code) DO NOTHING;
