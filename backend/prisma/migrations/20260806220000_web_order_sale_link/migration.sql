-- AlterTable: vincula un pedido web con la venta que se genero al atenderlo
ALTER TABLE "web_orders" ADD COLUMN "sale_id" TEXT;
