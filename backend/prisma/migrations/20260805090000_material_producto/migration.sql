-- AlterTable: material de la pieza (por defecto OTRO para lo ya existente)
ALTER TABLE "products" ADD COLUMN "material" TEXT NOT NULL DEFAULT 'OTRO';
