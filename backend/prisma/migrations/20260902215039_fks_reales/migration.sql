-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_client_debts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "client_id" TEXT NOT NULL,
    "sale_id" TEXT,
    "amount_total" DECIMAL NOT NULL,
    "amount_paid" DECIMAL NOT NULL DEFAULT 0,
    "due_date" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "client_debts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_debts_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_client_debts" ("amount_paid", "amount_total", "client_id", "created_at", "due_date", "id", "sale_id", "status", "updated_at") SELECT "amount_paid", "amount_total", "client_id", "created_at", "due_date", "id", "sale_id", "status", "updated_at" FROM "client_debts";
DROP TABLE "client_debts";
ALTER TABLE "new_client_debts" RENAME TO "client_debts";
CREATE INDEX "client_debts_client_id_idx" ON "client_debts"("client_id");
CREATE INDEX "client_debts_status_idx" ON "client_debts"("status");
CREATE INDEX "client_debts_sale_id_idx" ON "client_debts"("sale_id");
CREATE TABLE "new_products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio_unitario" DECIMAL NOT NULL,
    "costo_unitario" DECIMAL NOT NULL DEFAULT 0,
    "material" TEXT NOT NULL DEFAULT 'OTRO',
    "stock" INTEGER NOT NULL DEFAULT 0,
    "image_url" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "categoria_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "products_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_products" ("activo", "categoria_id", "costo_unitario", "created_at", "id", "image_url", "material", "nombre", "precio_unitario", "sku", "stock", "updated_at") SELECT "activo", "categoria_id", "costo_unitario", "created_at", "id", "image_url", "material", "nombre", "precio_unitario", "sku", "stock", "updated_at" FROM "products";
DROP TABLE "products";
ALTER TABLE "new_products" RENAME TO "products";
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE INDEX "products_categoria_id_idx" ON "products"("categoria_id");
CREATE TABLE "new_web_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codigo" TEXT NOT NULL,
    "items" TEXT NOT NULL,
    "total" DECIMAL NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "texto_original" TEXT NOT NULL,
    "notas" TEXT,
    "sale_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "web_orders_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_web_orders" ("codigo", "created_at", "estado", "id", "items", "notas", "sale_id", "texto_original", "total", "updated_at") SELECT "codigo", "created_at", "estado", "id", "items", "notas", "sale_id", "texto_original", "total", "updated_at" FROM "web_orders";
DROP TABLE "web_orders";
ALTER TABLE "new_web_orders" RENAME TO "web_orders";
CREATE UNIQUE INDEX "web_orders_codigo_key" ON "web_orders"("codigo");
CREATE INDEX "web_orders_estado_idx" ON "web_orders"("estado");
CREATE INDEX "web_orders_sale_id_idx" ON "web_orders"("sale_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
