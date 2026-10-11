-- Usuario de sistema al que se atribuyen las ventas hechas desde el punto de
-- venta oculto del catalogo web. Aparece como cualquier cajero en los
-- reportes, para que quede claro de donde salio cada venta. No puede iniciar
-- sesion: el hash no corresponde a ninguna clave conocida (se genero de un
-- valor aleatorio y se descarto).
INSERT INTO "users" ("id", "nombre", "email", "password_hash", "role", "activo", "created_at", "updated_at")
SELECT 'usuario-ventas-web', 'Ventas web', 'ventas-web@cafeshopping.local', '$2b$10$hBfYCS26L8RImtG22db4VePqV7nGaG/t1dThVW.ncdGk.BhAJGvYS', 'CAJERO', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "users" WHERE "email" = 'ventas-web@cafeshopping.local');
