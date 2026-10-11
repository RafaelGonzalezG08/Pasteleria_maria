# Cafe Shopping — Guía de uso

Sistema de punto de venta, facturación e inventario para joyería.

Esta guía está escrita para quien va a usar el programa en el negocio, no para
programadores. Léela una vez de principio a fin antes de empezar a vender.

---

## Índice

1. [Qué necesitas](#1-qué-necesitas)
2. [Instalación](#2-instalación)
3. [Primeros pasos (hazlo antes de vender)](#3-primeros-pasos-hazlo-antes-de-vender)
4. [Usuarios y permisos](#4-usuarios-y-permisos)
5. [Productos](#5-productos)
6. [Clientes](#6-clientes)
7. [Punto de venta](#7-punto-de-venta)
8. [Envío de facturas por WhatsApp](#8-envío-de-facturas-por-whatsapp)
9. [Pedidos](#9-pedidos)
10. [Ventas: corregir y eliminar facturas](#10-ventas-corregir-y-eliminar-facturas)
11. [Cobros](#11-cobros)
12. [Gastos](#12-gastos)
13. [Reportes](#13-reportes)
14. [Costos](#14-costos-solo-administrador)
15. [Respaldos](#15-respaldos)
16. [Problemas comunes](#16-problemas-comunes)

---

## 1. Qué necesitas

- Una computadora con **Windows 10 u 11**
- **WhatsApp Desktop** instalado y con la sesión abierta, si vas a enviar
  facturas por WhatsApp
- Nada más. El programa no necesita internet para vender, ni instalar
  programas adicionales.

> **Internet** solo hace falta para dos cosas: enviar facturas por WhatsApp y
> que los respaldos suban a OneDrive. Puedes facturar sin conexión.

---

## 2. Instalación

1. Haz doble clic en **`Cafe Shopping Setup 2.0.1.exe`**
2. Windows mostrará una pantalla azul: *"Windows protegió tu PC"*.
   Haz clic en **Más información** → **Ejecutar de todas formas**.
   Es normal: el instalador no tiene firma digital (es un trámite de pago
   anual), no significa que haya un problema.
3. Sigue el asistente. Puedes elegir la carpeta o dejar la que propone.
4. Al terminar tendrás un acceso directo **Cafe Shopping** en el escritorio.

Para abrirlo, doble clic en ese acceso directo. Tarda unos **5 segundos** en
levantar.

---

## 3. Primeros pasos (hazlo antes de vender)

### 3.1 Entrar por primera vez

La primera vez que abres el programa en una computadora, te pide **crear tu
usuario administrador**: escribes tu nombre, tu correo y una contraseña (dos
veces) y entras directo. No hay un usuario ni una clave de fábrica.

Esta pantalla **solo aparece una vez**: cuando actualices el programa a una
versión nueva, tus datos y tu usuario se conservan y entras con el login de
siempre. Solo se puede hacer desde la computadora donde está instalado, no
desde el celular.

### 3.2 Guarda bien tu clave

Anótala en un lugar seguro: es con la que entrarás cada vez. Si más adelante
quieres cambiarla: **Configuración** → **Cambiar mi clave**.

### 3.3 Datos de tu negocio

**Configuración** → **Datos del negocio**:

- **Nombre** — aparece en el encabezado de todas las facturas
- **Dirección**
- **RNC / ID fiscal** — se imprime en la factura
- **Tasa de impuesto** — se escribe en decimal: `0.18` significa 18%.
  Si no cobras impuesto, pon `0`.
- **Icono del negocio** — tu logo; sale en la factura y en el menú lateral

Guarda los cambios. Esto define cómo se ve cada factura que emitas.

---

## 4. Usuarios y permisos

Hay tres tipos de usuario. Se crean en **Configuración** → **Usuarios y roles**.

| Rol | Para quién | Qué puede hacer |
|---|---|---|
| **ADMIN** | El dueño | Todo, incluidos costos, ganancias y configuración |
| **CAJERO** | Quien atiende | Vender, cobrar, ver clientes y ventas. **No ve costos ni ganancias** |
| **CONTABILIDAD** | Contador | Reportes, gastos y cobros. No vende |

**Crea un usuario CAJERO para cada empleado.** Que no usen tu cuenta de
administrador: así los costos y márgenes quedan reservados para ti, y la
bitácora registra quién hizo cada cosa.

Cada quien puede cambiar su propia clave desde **Configuración**.

---

## 5. Productos

Aquí va tu catálogo de piezas. Menú **Productos** (solo ADMIN).

### Crear una pieza

**Nuevo producto** y llena:

- **Foto** — se explica más abajo
- **Nombre** — ej. *Anillo oro 18k con zafiro*
- **Precio** — a cuánto lo vendes
- **Stock** — cuántas unidades tienes
- **Costo de adquisición** — **cuánto te costó a ti**

> El **código (SKU)** se genera solo, a partir del nombre: *Anillo...* → `AN-0001`.

### Sobre el costo

El costo **solo lo ve el administrador**. Un cajero nunca lo verá, ni en la
pantalla ni si husmea. Sirve para que el sistema calcule tu ganancia real en
la sección **Costos**.

Si lo llenas, cada ficha muestra una etiqueta de margen: verde si ganas más
del 40%, ámbar entre 20% y 40%, rojo por debajo del 20%.

### Sobre las fotos

Arrastra la foto tal como salió del celular: **el programa la optimiza solo**
(la reduce a 1200×1200 y la comprime de ~3 MB a ~80 KB, sin que se note).

Para que el catálogo se vea profesional:

- Fondo neutro: blanco, gris claro o terciopelo oscuro
- Luz de ventana, **no flash directo** (rebota feo en el metal y las piedras)
- **El mismo fondo y ángulo en todas las piezas** — es lo que más se nota

La foto se recorta a cuadrado centrado, así que deja la pieza en el centro.

---

## 6. Clientes

Menú **Clientes**. Solo el **nombre** y el **teléfono** son obligatorios.

El teléfono importa: es a donde se envía la factura por WhatsApp. Escríbelo
con el código del país, ej. `+1809...`.

Al abrir un cliente ves su historial de compras y lo que debe.

> **Un cliente con ventas registradas no se puede borrar.** El sistema lo
> impide a propósito: borrarlo eliminaría el rastro de facturas ya emitidas a
> su nombre.

---

## 7. Punto de venta

Es la pantalla del día a día. Menú **Punto de venta**.

### Cobrar

1. **Busca la pieza** por nombre o código, y haz clic para agregarla
2. Los productos ya agregados se marcan en **verde con la cantidad**, para que
   no los agregues dos veces sin darte cuenta
3. Si vendes algo que no está en el catálogo, usa **Agregar ítem manual**
4. Elige el **método de pago**
5. Si es **Crédito**, tienes que elegir un cliente y poner fecha límite
6. Pulsa **Cobrar**

El sistema descuenta el inventario, genera la factura y —si el cliente tiene
teléfono— la envía por WhatsApp.

### Si no hay stock

El programa **no te deja** vender más piezas de las que tienes: avisa al
agregarlas al carrito, no al final. Es a propósito: enterarte con el cliente
enfrente es la peor forma de descubrirlo.

### Si te interrumpen

**No pierdes la venta a medias.** Si sales de la pantalla por accidente, o
incluso si se va la luz, al volver el carrito sigue ahí. Los borradores se
guardan por 12 horas.

---

## 8. Envío de facturas por WhatsApp

### Cómo funciona

El programa **no usa** ningún servicio de pago ni cobra por mensaje. Usa tu
propio WhatsApp Desktop: prepara la factura y la pega en el chat del cliente.

Para que funcione:

1. **WhatsApp Desktop abierto y con sesión iniciada**
2. El **agente** corriendo — se abre solo con el programa; verás un icono en
   la bandeja del sistema (junto al reloj)

### Enviar

Al cobrar una venta con cliente y teléfono, se envía sola. También puedes
reenviarla después desde **Ventas** → botón de WhatsApp.

### Importante

Mientras se envía, **no uses el mouse ni el teclado unos segundos**: el
programa está controlando WhatsApp y escribiendo por ti. Si mueves cosas en
medio, el envío puede fallar.

Si algo no llega, el registro está en:
`C:\temp\whatsapp_send\agent.log`

---

## 9. Pedidos

Para piezas que el cliente ya pagó (o encargó) pero **todavía no se lleva**:
un anillo que hay que ajustar, una cadena por encargo, algo que se entrega la
semana que viene.

### Crear un pedido

Al cobrar en el punto de venta, marca **"Es un pedido por entregar"** y ponle
fecha de entrega.

### Estados

**Pendiente** → **Empacado** → **Entregado**

Al marcarlo **Entregado**, el pedido desaparece del listado y la factura queda
como el registro de esa venta. Pide confirmación porque no se puede deshacer.

### En el Dashboard

Los pedidos aparecen **arriba de todo** en la pantalla principal. Si hay
alguno atrasado, **el bloque completo se pone rojo**. Así lo ves sin tener que
leer: son compromisos con clientes que están esperando.

---

## 10. Ventas: corregir y eliminar facturas

Menú **Ventas**: el historial completo. Haz clic en cualquiera para ver el
detalle.

Solo el **administrador** puede corregir o eliminar, y en ambos casos hay que
**volver a escribir la clave** aunque la sesión esté abierta. No es un
capricho: mueve inventario, reportes y posiblemente una deuda.

### Corregir (✏️)

Para errores de digitación: cantidad o precio equivocado, una línea de más.
Las piezas que quites **vuelven al inventario** y la factura se regenera.

### Eliminar (🗑️)

Borra la venta completa. Antes de confirmar, te muestra exactamente qué
piezas vuelven al inventario.

> **No se puede eliminar una factura con abonos registrados.** El sistema lo
> impide: haría desaparecer el rastro de dinero que el cliente ya entregó. Si
> de verdad hay que corregirla, usa la opción de corregir.

**Cuándo usar cada una:** si te equivocaste al digitar hoy, corrige. Si el
cliente devolvió la pieza la semana pasada, no borres la factura — eso
reescribe la historia y descuadra el reporte de aquel día.

---

## 11. Cobros

Menú **Cobros**: todo lo que te deben las ventas a crédito.

- **Registrar abono** — cuando el cliente da algo a cuenta. La factura se
  regenera con el saldo actualizado.
- **Recordatorio por WhatsApp** — envía la factura con el saldo pendiente.

### Estados

| Estado | Significa |
|---|---|
| Pendiente | Sin abonos aún |
| Abono parcial | Ya dio algo a cuenta |
| Vencida | Pasó la fecha límite |
| Pagada | Saldada |

Una deuda vencida **sigue marcada como vencida** aunque el cliente abone algo,
mientras quede saldo. Así no se te pierde de vista.

---

## 12. Gastos

Menú **Gastos** (ADMIN y CONTABILIDAD). Registra lo que sale: alquiler,
suministros, publicidad, transporte.

Sirve para que el reporte de **flujo de caja** muestre tu situación real, no
solo lo que entró.

---

## 13. Reportes

Menú **Reportes** (ADMIN y CONTABILIDAD).

- **Ingresos, egresos y flujo neto** del período
- **Ventas por período** — día, semana, mes o año
- **Clientes con deudas**
- **Gastos por categoría**
- **Exportar a CSV** para abrirlo en Excel

El rango de fechas se recuerda al navegar a otra pantalla y volver.

---

## 14. Costos (solo administrador)

Menú **Costos**. Es la pantalla de tu ganancia real, y **ningún cajero la ve**.

Muestra, por período:

- **Ingresos** — lo que vendiste
- **Costo** — lo que te costaron esas piezas
- **Utilidad** — lo que ganaste de verdad
- **Margen %**

Y el desglose pieza por pieza, ordenado de más a menos rentable.

> Usa el costo **del momento de la venta**, no el actual. Si mañana te cambia
> el precio del proveedor, tus ganancias del mes pasado no se distorsionan.

Para que esto funcione, llena el **costo de adquisición** de cada producto.

---

## 15. Respaldos

### Automático

Cada 3 días el programa guarda una copia completa (base de datos y fotos) y
**la sube sola a tu OneDrive**, en `OneDrive\CafeShopping\Respaldos`.

Esto es importante: si el disco falla, lo roban o entra un virus, **tus datos
siguen existiendo fuera de la computadora**. Es la diferencia entre un mal día
y perder el negocio.

Se conservan 30 días en la computadora y no se borran de OneDrive.

### Manual

**Configuración** → **Respaldos** → **Generar respaldo ahora**. Hazlo antes de
cualquier cosa arriesgada.

### Restaurar

Desde la misma pantalla, eligiendo un respaldo de la lista.

> **Restaurar reemplaza todo por lo que había ese día.** Las ventas
> registradas después se pierden. Úsalo solo si algo salió realmente mal.

### Dónde están tus datos

En `%APPDATA%\cafe-shopping-desktop\datos`. Ahí vive todo: base de datos,
fotos y facturas. Está fuera de la carpeta del programa a propósito, para que
las actualizaciones no se lleven nada por delante.

Si quieres una copia manual, copia esa carpeta completa a un USB.

---

## 16. Problemas comunes

### La aplicación no abre / se queda cargando

Ciérrala del todo y ábrela otra vez. Si dice que ya está abierta, busca la
ventana en la barra de tareas: solo permite una a la vez a propósito.

### La factura no llegó por WhatsApp

Revisa, en este orden:

1. ¿WhatsApp Desktop está abierto y con la sesión iniciada?
2. ¿El cliente tiene el teléfono bien escrito, con código de país?
3. ¿El agente está corriendo? (icono en la bandeja, junto al reloj)
4. Mira `C:\temp\whatsapp_send\agent.log` — dice qué pasó

Puedes reenviarla desde **Ventas** sin volver a cobrar.

### No me deja vender una pieza

Dice cuántas quedan. Si el número no cuadra con lo que ves en la vitrina,
corrígelo en **Productos** editando el stock.

### No me deja borrar un cliente

Tiene ventas o deudas registradas. Es a propósito: borrarlo eliminaría el
rastro de sus facturas.

### No veo Costos, Productos o Configuración

Estás entrando como CAJERO. Esas secciones son solo del administrador.

### Se me olvidó la clave

Si es de un empleado, entra como administrador, crea un usuario nuevo y
desactiva el anterior.

Si es la del administrador y no hay otro administrador activo, no hay forma de
recuperarla desde el programa: hay que restaurar un respaldo anterior al
cambio, o pedir ayuda técnica.

**Por eso conviene tener dos usuarios administradores**, uno de respaldo.

---

## Resumen de lo que no debes olvidar

1. **Cambia la clave inicial** antes de la primera venta
2. **Un usuario propio para cada empleado**, nunca el tuyo
3. **Llena el costo** de cada producto, o la sección Costos no sirve
4. **Ten WhatsApp Desktop abierto** mientras factures
5. **Revisa de vez en cuando** que los respaldos lleguen a OneDrive
6. **No borres facturas viejas** para arreglar devoluciones — descuadra los
   reportes de aquel día
