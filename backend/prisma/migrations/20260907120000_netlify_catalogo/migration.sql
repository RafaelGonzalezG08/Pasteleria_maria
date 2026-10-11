-- Publicacion automatica del catalogo a Netlify (opcional). Si estan puestos
-- los dos, la app sube el sitio a Netlify por su API despues de cada
-- regeneracion; si no, el catalogo sigue siendo un folder que se sube a mano.
ALTER TABLE "business_profile" ADD COLUMN "netlify_token" TEXT;
ALTER TABLE "business_profile" ADD COLUMN "netlify_site_id" TEXT;
