-- AlterTable: descuento porcentual aplicado a la venta (0-100), guardado
-- para que la factura ya generada mantenga el mismo descuento.
ALTER TABLE "sales" ADD COLUMN "descuento_pct" DECIMAL NOT NULL DEFAULT 0;
