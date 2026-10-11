-- CreateTable: categorias de joyas definidas por el negocio
CREATE TABLE "categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "categories_nombre_key" ON "categories"("nombre");

-- AlterTable: columna suelta (no llave foranea real, ver schema.prisma)
ALTER TABLE "products" ADD COLUMN "categoria_id" TEXT;
