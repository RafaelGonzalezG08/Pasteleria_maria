-- CreateTable: pedidos que llegan del catalogo web (se pegan desde WhatsApp)
CREATE TABLE "web_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codigo" TEXT NOT NULL,
    "items" TEXT NOT NULL,
    "total" DECIMAL NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "texto_original" TEXT NOT NULL,
    "notas" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "web_orders_codigo_key" ON "web_orders"("codigo");

-- CreateIndex
CREATE INDEX "web_orders_estado_idx" ON "web_orders"("estado");
