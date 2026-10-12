# Pastelería María — Guía de uso

Esta guía es para quien usa el programa en la pastelería, no para
programadores. Léela una vez completa antes de empezar.

---

## Índice

1. [Qué necesitas](#1-qué-necesitas)
2. [Instalación y primer arranque](#2-instalación-y-primer-arranque)
3. [Preparar el negocio (una sola vez)](#3-preparar-el-negocio-una-sola-vez)
4. [Usuarios y permisos](#4-usuarios-y-permisos)
5. [Inventario de insumos](#5-inventario-de-insumos)
6. [Recetas](#6-recetas)
7. [Producción](#7-producción)
8. [Productos](#8-productos)
9. [Encargos](#9-encargos)
10. [Punto de venta](#10-punto-de-venta)
11. [Factura por WhatsApp](#11-factura-por-whatsapp)
12. [Compras y proveedores](#12-compras-y-proveedores)
13. [Clientes](#13-clientes)
14. [Ventas, cobros y gastos](#14-ventas-cobros-y-gastos)
15. [Reportes](#15-reportes)
16. [Respaldos](#16-respaldos)
17. [Actualizaciones](#17-actualizaciones)
18. [Problemas comunes](#18-problemas-comunes)

---

## 1. Qué necesitas

- Una PC con Windows 10 u 11.
- **WhatsApp Desktop** instalado y con sesión iniciada, si vas a mandar
  facturas por WhatsApp.
- Internet solo para recibir actualizaciones; para trabajar no hace falta.

## 2. Instalación y primer arranque

1. Ejecuta `Pasteleria-Maria-Setup-X.Y.Z.exe` y sigue los pasos.
2. Abre **Pastelería María** desde el escritorio.
3. La primera vez aparece **Crear administrador**: escribe tu nombre, tu correo
   y una contraseña que recuerdes. Ese es el usuario dueño del sistema; no
   existe ningún usuario "de fábrica".

La sesión se cierra sola tras 30 minutos sin uso y al cerrar el programa.

## 3. Preparar el negocio (una sola vez)

En **Configuración** (engranaje, abajo a la izquierda):

- **Datos del negocio:** nombre, logo, dirección, teléfono y RNC (salen en la
  factura y en el ticket de encargo).
- **Moneda:** RD$ por defecto.
- **Impuesto:** nombre (ITBIS) y porcentaje (18). Pon 0 si no cobras impuesto.
- **Ganancia sobre el costo (%):** se usa para el *precio sugerido* de las recetas.
- **Días de aviso:** con cuánta anticipación avisar de encargos, vencimientos y cumpleaños.

Después, en este orden: proveedores → insumos → productos → recetas.

## 4. Usuarios y permisos

**Configuración → Usuarios y roles → Agregar usuario.** Cada persona entra con
su propio correo. Se puede cambiar el rol o desactivar a alguien cuando quieras.

| Rol | Para quién | Puede |
|---|---|---|
| Administrador | Dueño | Todo, incluidos costos, márgenes, compras, reportes y configuración. |
| Cajero | Mostrador | Vender, tomar y cobrar encargos, cobros y clientes. |
| Repostero | Cocina | Inventario, recetas, producción y marcar encargos en producción / listos. No ve costos. |

## 5. Inventario de insumos

Insumos = todo lo que se gasta: harina, azúcar, huevos, mantequilla… y también
materiales como cajas, bases de pastel o velas.

- **Nuevo insumo:** nombre, tipo, **unidad de inventario** (kg, g, lb, L, ml,
  unidad, docena…), stock mínimo, costo y la existencia actual con su fecha de
  vencimiento. La unidad no se puede cambiar después de usarlo.
- **Movimientos** (abre el insumo):
  - *Entrada:* llegó mercancía sin factura (para compras usa Compras).
  - *Salida:* se usó fuera de una receta.
  - *Merma:* se dañó o venció. Sale en el reporte de mermas.
  - *Ajuste:* escribe lo que contaste en el almacén; el sistema registra la diferencia.
- Puedes escribir la cantidad en otra unidad de la misma medida (2 lb de un
  insumo en kg). Peso, volumen y cantidad no se mezclan: 3 huevos no se
  convierten a gramos.
- Cada entrada es un **lote** con su vencimiento; al gastar se usa primero el
  que vence antes.
- **Alertas:** en rojo lo que está bajo el mínimo; con fecha lo que vence pronto.
- **Lista de compras:** qué comprar para los encargos de los próximos días y
  para volver al mínimo, con el proveedor de cada insumo.

## 6. Recetas

- **Nueva receta:** nombre, cuánto rinde (ej. 1 unidad, 24 unidades, 1 docena),
  porciones, tiempo, ingredientes con su cantidad y los pasos.
- **Subrecetas:** rellenos, cremas, masas que se preparan aparte y se usan en
  varias recetas. Márcala como *subreceta* y luego agrégala como ingrediente
  (ej. 300 g de relleno de dulce de leche).
- **Producto que produce:** elige el producto que sale de la receta; así la
  producción suma existencia y el producto toma su costo.
- El **costo** se calcula solo con el precio actual de los insumos: costo total,
  por unidad y por porción, y el **precio sugerido** (costo + ganancia).
  Cuando registras una compra más cara, los costos se actualizan solos.
- **Escalar:** en la receta abierta escribe ×2, ×5… para ver las cantidades y
  si alcanza el inventario.

## 7. Producción

**Producción → Registrar producción:** receta y tandas. Antes de guardar se ve
qué se va a descontar; si falta algo, no deja registrar. Al guardar:

- se descuentan los insumos (también los de las subrecetas);
- se suma la existencia del producto.

Si te equivocaste, el administrador puede **anular** la producción.

**Hoja de producción del día:** los encargos que se entregan ese día con toda
la personalización (sabor, relleno, mensaje, foto) y cuántas tandas hacer
descontando lo que ya está hecho. Se puede imprimir.

## 8. Productos

Pasteles, panes, bizcochos y postres listos para vender: precio, categoría,
foto opcional y existencia. La existencia sube con la producción y baja con las
ventas, las entregas de encargos y las mermas (**Registrar merma** en la tarjeta).

**Vender un pastel por porciones:**

1. Crea un producto nuevo, por ejemplo *Porción de pastel de chocolate*, con el
   precio de cada pedazo.
2. En **Se vende por porción de** elige el pastel entero (*Pastel de chocolate
   10"*) y escribe cuántas porciones da (ej. 16).
3. Para tener porciones en existencia hay dos formas:
   - **Cortar en porciones** (en la tarjeta de la porción): baja 1 pastel entero
     y suben 16 porciones. En la caja, si se acabaron las porciones y hay un
     pastel entero, el sistema ofrece cortarlo ahí mismo.
   - **Producir directo en porciones:** en Producción, al elegir la receta del
     pastel aparece **Sale como**; elige *Porciones* y la tanda suma 16
     porciones por cada pastel, sin pasar por los enteros.
4. El costo de cada porción es el del pastel entero dividido entre sus
   porciones, así la ganancia por pedazo sale correcta en Reportes.

## 9. Encargos

**Encargos → Nuevo encargo:**

1. Cliente (búscalo o créalo ahí mismo).
2. Fecha y hora de entrega; retiro en tienda o a domicilio (dirección y costo de envío).
3. Productos: del catálogo o "Personalizado". En **Personalizar**: tamaño,
   sabor, relleno, decoración, mensaje escrito y foto de referencia.
4. Anticipo (opcional) y forma de pago.

Después, desde el encargo:

- **Ticket:** comprobante imprimible para el cliente.
- **Estado:** Pendiente → En producción → Listo.
- **Abonar:** registrar más pagos antes de la entrega.
- **Entregar y cobrar:** se cobra el saldo y se crea la venta con su factura
  (que se puede mandar por WhatsApp desde Ventas). Si el cliente no paga todo,
  marca *dejar a crédito* y el saldo pasa a Cobros.
- **Cancelar:** si ya pagó algo y se le devuelve, regístralo en Gastos.

La vista **Calendario** muestra los encargos de cada día del mes. En el
Dashboard salen los atrasados (en rojo), los de hoy y los próximos.

## 10. Punto de venta

Toca los productos para agregarlos, ajusta cantidades, elige cliente (obligatorio
a crédito), descuento y forma de pago, y **Cobrar**. Se genera la factura.
El carrito se guarda solo si sales de la pantalla sin querer.

## 11. Factura por WhatsApp

Con WhatsApp Desktop abierto, **Enviar por WhatsApp** pone la factura en cola;
el agente la pega en el chat del cliente en unos segundos. El estado (en cola,
enviada, error) se ve en Ventas.

## 12. Compras y proveedores

- **Proveedores:** nombre, contacto, teléfono.
- **Registrar compra:** proveedor, fecha, número de factura y cada línea con
  insumo, cantidad, unidad, lo que pagaste y el vencimiento. Al guardar:
  entra al inventario, se actualiza el costo del insumo y se registra en Gastos.
- Se puede **anular** una compra mientras no se haya usado nada de ella.

## 13. Clientes

Ficha con teléfono, dirección, cumpleaños, fechas especiales y notas. Muestra
deudas, compras y encargos del cliente. El Dashboard avisa de cumpleaños y
fechas especiales próximas.

## 14. Ventas, cobros y gastos

- **Ventas:** historial, ver/reenviar factura, corregir o eliminar (solo
  administrador, con su contraseña). Las ventas que vienen de un encargo no se
  corrigen desde aquí.
- **Cobros:** ventas a crédito con saldo, abonos y recordatorio por WhatsApp.
- **Gastos:** renta, luz, sueldos… (las compras de insumos ya entran solas).

## 15. Reportes

Ventas por período, productos más vendidos, ganancia estimada (venta − costo de
receta), mermas, insumos por agotarse, cuentas por cobrar (saldos de encargos y
créditos), gastos y flujo de caja. **Transacciones** muestra todo el dinero que
entró y salió, incluidos los anticipos.

## 16. Respaldos

Se hacen solos cada 3 días (y se copian a OneDrive si lo tienes). En
**Configuración → Respaldos** puedes hacer uno al momento o restaurar uno
anterior. Restaurar reemplaza todos los datos actuales.

## 17. Actualizaciones

Al abrir el programa busca versiones nuevas. Si hay una, la descarga y pregunta
si instalarla ahora o la próxima vez. Tus datos no se tocan.

## 18. Problemas comunes

| Problema | Qué hacer |
|---|---|
| "No hay suficiente … para esta producción" | Registra la compra o un ajuste de inventario, o baja las tandas. |
| "No se puede convertir … son medidas distintas" | Usa una unidad de la misma medida que el insumo (peso con peso, volumen con volumen, cantidad con cantidad). |
| La factura no llega por WhatsApp | Abre WhatsApp Desktop con la sesión iniciada y reintenta desde Ventas. |
| "Parece que Pastelería María ya está abierta" | Cierra la otra ventana; si no ves ninguna, reinicia la PC. |
| Olvidé la contraseña | Otro administrador puede crearte un usuario nuevo. |
