-- Tallas / medidas de una pieza (anillos: 5, 6, 7...; cadenas: 45cm, 50cm...).
-- Se guarda como texto JSON (un arreglo de strings), igual patron que
-- audit_logs.changes: SQLite no tiene tipo Json. NULL o "[]" = sin tallas.
ALTER TABLE "products" ADD COLUMN "tallas" TEXT;
