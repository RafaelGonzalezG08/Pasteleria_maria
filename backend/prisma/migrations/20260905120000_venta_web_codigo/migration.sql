-- AlterTable: codigo de la venta creada desde el catalogo web (VNT-XXXX).
-- Sirve para que el relevo no cree la misma venta dos veces si el borrado
-- del relevo en la nube falla despues de un create exitoso.
ALTER TABLE "sales" ADD COLUMN "web_codigo" TEXT;

-- CreateIndex: unico, pero SQLite permite multiples NULL, asi que las ventas
-- normales (sin codigo web) no chocan entre si.
CREATE UNIQUE INDEX "sales_web_codigo_key" ON "sales"("web_codigo");
