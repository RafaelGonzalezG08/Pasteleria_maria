-- AlterTable: cola de envio de facturas por WhatsApp.
--
-- Antes, "Enviar por WhatsApp" bloqueaba la peticion HTTP hasta 4 minutos
-- esperando la confirmacion del agente. Si el agente estaba caido, el cajero se
-- quedaba mirando un spinner todo ese rato para al final ver un error. Ahora el
-- envio se ENCOLA (respuesta inmediata) y un proceso en segundo plano lo
-- procesa con reintentos.
--
--   whatsapp_estado:           NULL (nunca se pidio) | EN_COLA | ENVIADA | ERROR
--   whatsapp_intentos:         cuantas veces se intento enviar
--   whatsapp_proximo_intento:  cuando reintentar (backoff)
--   whatsapp_mensaje:          el texto a enviar (guardado para que el worker no
--                              lo recalcule y respete si era factura o recordatorio)
ALTER TABLE "invoices" ADD COLUMN "whatsapp_estado" TEXT;
ALTER TABLE "invoices" ADD COLUMN "whatsapp_intentos" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN "whatsapp_proximo_intento" DATETIME;
ALTER TABLE "invoices" ADD COLUMN "whatsapp_mensaje" TEXT;

CREATE INDEX "invoices_whatsapp_estado_idx" ON "invoices"("whatsapp_estado");

-- Las facturas que ya estaban marcadas como ENVIADA conservan ese estado en la
-- cola, para que el historial se vea consistente.
UPDATE "invoices" SET "whatsapp_estado" = 'ENVIADA' WHERE "sent_whatsapp_at" IS NOT NULL;
