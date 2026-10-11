-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CAJERO',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "email" TEXT,
    "direccion" TEXT,
    "notas" TEXT,
    "cumpleanos" DATETIME,
    "fechas_especiales" TEXT,
    "last_reminder_sent_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "products" (
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
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "products_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "mermas_producto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "product_id" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "costo_unitario" DECIMAL NOT NULL DEFAULT 0,
    "motivo" TEXT,
    "user_id" TEXT,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mermas_producto_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "mermas_producto_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "insumos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'INGREDIENTE',
    "unidad" TEXT NOT NULL,
    "stock_actual" DECIMAL NOT NULL DEFAULT 0,
    "stock_minimo" DECIMAL NOT NULL DEFAULT 0,
    "costo_unitario" DECIMAL NOT NULL DEFAULT 0,
    "proveedor_id" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "insumos_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "lotes_insumo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "insumo_id" TEXT NOT NULL,
    "cantidad_inicial" DECIMAL NOT NULL,
    "cantidad_restante" DECIMAL NOT NULL,
    "costo_unitario" DECIMAL NOT NULL DEFAULT 0,
    "fecha_vencimiento" DATETIME,
    "fecha_entrada" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "compra_item_id" TEXT,
    CONSTRAINT "lotes_insumo_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "insumos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lotes_insumo_compra_item_id_fkey" FOREIGN KEY ("compra_item_id") REFERENCES "compra_items" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "movimientos_insumo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "insumo_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidad" DECIMAL NOT NULL,
    "costo_unitario" DECIMAL NOT NULL DEFAULT 0,
    "stock_resultante" DECIMAL NOT NULL,
    "motivo" TEXT,
    "produccion_id" TEXT,
    "compra_id" TEXT,
    "user_id" TEXT,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "movimientos_insumo_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "insumos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "movimientos_insumo_produccion_id_fkey" FOREIGN KEY ("produccion_id") REFERENCES "producciones" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "movimientos_insumo_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "movimientos_insumo_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "recetas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "es_subreceta" BOOLEAN NOT NULL DEFAULT false,
    "rendimiento" DECIMAL NOT NULL,
    "unidad_rendimiento" TEXT NOT NULL,
    "porciones" INTEGER,
    "tiempo_preparacion_min" INTEGER,
    "pasos" TEXT,
    "margen_pct" DECIMAL,
    "producto_id" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "recetas_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "receta_ingredientes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "receta_id" TEXT NOT NULL,
    "insumo_id" TEXT,
    "subreceta_id" TEXT,
    "cantidad" DECIMAL NOT NULL,
    "unidad" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "receta_ingredientes_receta_id_fkey" FOREIGN KEY ("receta_id") REFERENCES "recetas" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "receta_ingredientes_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "insumos" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "receta_ingredientes_subreceta_id_fkey" FOREIGN KEY ("subreceta_id") REFERENCES "recetas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "producciones" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receta_id" TEXT NOT NULL,
    "tandas" DECIMAL NOT NULL,
    "unidades_producidas" INTEGER NOT NULL DEFAULT 0,
    "producto_id" TEXT,
    "costo_total" DECIMAL NOT NULL DEFAULT 0,
    "notas" TEXT,
    "user_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "producciones_receta_id_fkey" FOREIGN KEY ("receta_id") REFERENCES "recetas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "producciones_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "producciones_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "produccion_consumos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "produccion_id" TEXT NOT NULL,
    "insumo_id" TEXT NOT NULL,
    "cantidad" DECIMAL NOT NULL,
    "costo_unitario" DECIMAL NOT NULL,
    CONSTRAINT "produccion_consumos_produccion_id_fkey" FOREIGN KEY ("produccion_id") REFERENCES "producciones" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "produccion_consumos_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "insumos" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "contacto" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "compras" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proveedor_id" TEXT,
    "numero_factura" TEXT,
    "total" DECIMAL NOT NULL,
    "notas" TEXT,
    "expense_id" TEXT,
    "user_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "compras_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "compras_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "compras_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "compra_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "compra_id" TEXT NOT NULL,
    "insumo_id" TEXT NOT NULL,
    "cantidad" DECIMAL NOT NULL,
    "unidad" TEXT NOT NULL,
    "costo_total" DECIMAL NOT NULL,
    "fecha_vencimiento" DATETIME,
    CONSTRAINT "compra_items_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "compra_items_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "insumos" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL NOT NULL,
    "impuestos" DECIMAL NOT NULL DEFAULT 0,
    "total" DECIMAL NOT NULL,
    "descuento_pct" DECIMAL NOT NULL DEFAULT 0,
    "metodo_pago" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sales_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sale_id" TEXT NOT NULL,
    "product_id" TEXT,
    "descripcion" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL NOT NULL,
    "costo_unitario" DECIMAL NOT NULL DEFAULT 0,
    "total" DECIMAL NOT NULL,
    CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sale_id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "pdf_url" TEXT,
    "png_url" TEXT,
    "sent_whatsapp_at" DATETIME,
    "ultimo_error" TEXT,
    "whatsapp_estado" TEXT,
    "whatsapp_intentos" INTEGER NOT NULL DEFAULT 0,
    "whatsapp_proximo_intento" DATETIME,
    "whatsapp_mensaje" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "invoices_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sale_id" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metodo" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "client_debts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "client_id" TEXT NOT NULL,
    "sale_id" TEXT,
    "amount_total" DECIMAL NOT NULL,
    "amount_paid" DECIMAL NOT NULL DEFAULT 0,
    "due_date" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "client_debts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "client_debts_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categoria" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto" DECIMAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "encargos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codigo" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "fecha_entrega" DATETIME NOT NULL,
    "tipo_entrega" TEXT NOT NULL DEFAULT 'RETIRO',
    "direccion_entrega" TEXT,
    "costo_envio" DECIMAL NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "impuestos" DECIMAL NOT NULL DEFAULT 0,
    "total" DECIMAL NOT NULL DEFAULT 0,
    "tasa_impuesto" DECIMAL NOT NULL DEFAULT 0,
    "abonado" DECIMAL NOT NULL DEFAULT 0,
    "notas" TEXT,
    "motivo_cancelacion" TEXT,
    "sale_id" TEXT,
    "entregado_at" DATETIME,
    "user_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "encargos_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "encargos_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "encargos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "encargo_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "encargo_id" TEXT NOT NULL,
    "product_id" TEXT,
    "descripcion" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL NOT NULL,
    "total" DECIMAL NOT NULL,
    "tamano" TEXT,
    "sabor" TEXT,
    "relleno" TEXT,
    "decoracion" TEXT,
    "mensaje" TEXT,
    "foto_referencia_url" TEXT,
    CONSTRAINT "encargo_items_encargo_id_fkey" FOREIGN KEY ("encargo_id") REFERENCES "encargos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "encargo_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "encargo_pagos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "encargo_id" TEXT NOT NULL,
    "monto" DECIMAL NOT NULL,
    "metodo" TEXT NOT NULL,
    "nota" TEXT,
    "user_id" TEXT,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "encargo_pagos_encargo_id_fkey" FOREIGN KEY ("encargo_id") REFERENCES "encargos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "encargo_pagos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "user_id" TEXT,
    "changes" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "business_profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL DEFAULT 'Pastelería María',
    "logo_url" TEXT,
    "direccion" TEXT,
    "telefono" TEXT,
    "identif_fiscal" TEXT,
    "moneda" TEXT NOT NULL DEFAULT 'RD$',
    "nombre_impuesto" TEXT NOT NULL DEFAULT 'ITBIS',
    "tasa_impuesto" DECIMAL NOT NULL DEFAULT 0.18,
    "margen_ganancia_pct" DECIMAL NOT NULL DEFAULT 60,
    "dias_alerta_encargos" INTEGER NOT NULL DEFAULT 2,
    "dias_alerta_vencimiento" INTEGER NOT NULL DEFAULT 7,
    "dias_alerta_cumpleanos" INTEGER NOT NULL DEFAULT 7,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_categoria_id_idx" ON "products"("categoria_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_nombre_key" ON "categories"("nombre");

-- CreateIndex
CREATE INDEX "mermas_producto_fecha_idx" ON "mermas_producto"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "insumos_nombre_key" ON "insumos"("nombre");

-- CreateIndex
CREATE INDEX "lotes_insumo_insumo_id_idx" ON "lotes_insumo"("insumo_id");

-- CreateIndex
CREATE INDEX "lotes_insumo_fecha_vencimiento_idx" ON "lotes_insumo"("fecha_vencimiento");

-- CreateIndex
CREATE INDEX "movimientos_insumo_insumo_id_idx" ON "movimientos_insumo"("insumo_id");

-- CreateIndex
CREATE INDEX "movimientos_insumo_fecha_idx" ON "movimientos_insumo"("fecha");

-- CreateIndex
CREATE INDEX "movimientos_insumo_tipo_idx" ON "movimientos_insumo"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "recetas_nombre_key" ON "recetas"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "recetas_producto_id_key" ON "recetas"("producto_id");

-- CreateIndex
CREATE INDEX "receta_ingredientes_receta_id_idx" ON "receta_ingredientes"("receta_id");

-- CreateIndex
CREATE INDEX "producciones_fecha_idx" ON "producciones"("fecha");

-- CreateIndex
CREATE INDEX "produccion_consumos_produccion_id_idx" ON "produccion_consumos"("produccion_id");

-- CreateIndex
CREATE UNIQUE INDEX "compras_expense_id_key" ON "compras"("expense_id");

-- CreateIndex
CREATE INDEX "compras_fecha_idx" ON "compras"("fecha");

-- CreateIndex
CREATE INDEX "sales_fecha_idx" ON "sales"("fecha");

-- CreateIndex
CREATE INDEX "sales_client_id_idx" ON "sales"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_sale_id_key" ON "invoices"("sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_numero_key" ON "invoices"("numero");

-- CreateIndex
CREATE INDEX "invoices_whatsapp_estado_idx" ON "invoices"("whatsapp_estado");

-- CreateIndex
CREATE INDEX "client_debts_client_id_idx" ON "client_debts"("client_id");

-- CreateIndex
CREATE INDEX "client_debts_status_idx" ON "client_debts"("status");

-- CreateIndex
CREATE INDEX "client_debts_sale_id_idx" ON "client_debts"("sale_id");

-- CreateIndex
CREATE INDEX "expenses_fecha_idx" ON "expenses"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "encargos_codigo_key" ON "encargos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "encargos_sale_id_key" ON "encargos"("sale_id");

-- CreateIndex
CREATE INDEX "encargos_estado_idx" ON "encargos"("estado");

-- CreateIndex
CREATE INDEX "encargos_fecha_entrega_idx" ON "encargos"("fecha_entrega");

-- CreateIndex
CREATE INDEX "encargos_client_id_idx" ON "encargos"("client_id");

-- CreateIndex
CREATE INDEX "encargo_items_encargo_id_idx" ON "encargo_items"("encargo_id");

-- CreateIndex
CREATE INDEX "encargo_pagos_fecha_idx" ON "encargo_pagos"("fecha");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

