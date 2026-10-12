-- Venta por porcion: un producto puede ser porcion de otro (el entero).
-- Se AGREGAN columnas en vez de recrear la tabla products: recrearla con las
-- llaves foraneas activas dispara los ON DELETE de recetas, producciones,
-- lineas de venta y mermas (ver MigrationsService).
ALTER TABLE "products" ADD COLUMN "porcion_de_id" TEXT REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD COLUMN "porciones_por_unidad" INTEGER;
