-- Se cambia la publicacion automatica del catalogo de Netlify a Cloudflare
-- Pages: Netlify reescribio su plan gratis a un sistema de creditos (300/mes,
-- 15 por despliegue en produccion = ~20 al mes compartidos con el trafico de
-- visitantes) que no alcanza para publicar en cada venta. Cloudflare Pages da
-- 500 despliegues al mes gratis y ancho de banda sin costo, y el negocio ya
-- tiene cuenta ahi por el relevo de pedidos.
--
-- SQLite soporta DROP COLUMN de forma nativa desde 3.35 (no hace falta el
-- patron de "recrear tabla", reservado para llaves foraneas).
ALTER TABLE "business_profile" DROP COLUMN "netlify_token";
ALTER TABLE "business_profile" DROP COLUMN "netlify_site_id";

ALTER TABLE "business_profile" ADD COLUMN "cloudflare_api_token" TEXT;
ALTER TABLE "business_profile" ADD COLUMN "cloudflare_account_id" TEXT;
ALTER TABLE "business_profile" ADD COLUMN "cloudflare_pages_project" TEXT;
