-- Fixture de prueba: recrea la tabla products tal como lo haria una migracion
-- generada por Prisma (patron "RedefineTables" de SQLite).
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio_unitario" DECIMAL NOT NULL,
    "costo_unitario" DECIMAL NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "image_url" TEXT,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "categoria_id" TEXT,
    "porcion_de_id" TEXT,
    "porciones_por_unidad" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "products_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "products_porcion_de_id_fkey" FOREIGN KEY ("porcion_de_id") REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_products" SELECT "id", "sku", "nombre", "precio_unitario", "costo_unitario", "stock", "image_url", "descripcion", "activo", "categoria_id", "porcion_de_id", "porciones_por_unidad", "created_at", "updated_at" FROM "products";
DROP TABLE "products";
ALTER TABLE "new_products" RENAME TO "products";
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE INDEX "products_categoria_id_idx" ON "products"("categoria_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
