-- La app paso de llamarse "Pastelería María" a "Rosa Delicias". Solo se
-- renombra el perfil que todavia tiene el nombre de fabrica; si el negocio
-- ya escribio el suyo en Configuracion, se respeta.
UPDATE "business_profile" SET "nombre" = 'Rosa Delicias' WHERE "nombre" = 'Pastelería María';
