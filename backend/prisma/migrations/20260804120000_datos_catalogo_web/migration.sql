-- AlterTable: datos que solo usa el catalogo web
ALTER TABLE "business_profile" ADD COLUMN "telefono_whatsapp" TEXT;
ALTER TABLE "business_profile" ADD COLUMN "descripcion_web" TEXT;
ALTER TABLE "business_profile" ADD COLUMN "datos_pago" TEXT;
