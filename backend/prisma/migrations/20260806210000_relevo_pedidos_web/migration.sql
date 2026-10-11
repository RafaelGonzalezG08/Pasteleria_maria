-- AlterTable: relevo en la nube opcional para automatizar Pedidos web
ALTER TABLE "business_profile" ADD COLUMN "relevo_pedidos_url" TEXT;
ALTER TABLE "business_profile" ADD COLUMN "relevo_pedidos_clave" TEXT;
