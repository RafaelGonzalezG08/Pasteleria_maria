# Relevo de pedidos web (Cloudflare Worker)

Pieza minima en la nube que permite que un pedido hecho en el catalogo web
caiga solo en la app de escritorio, sin que nadie tenga que pegar el mensaje
de WhatsApp a mano. Ver `worker.js` para el codigo completo.

No guarda nada del negocio: solo el codigo del pedido y el texto del mensaje,
por unos minutos, hasta que la app los recoge.

## Como se desplego (panel de Cloudflare, sin instalar nada)

1. **Workers & Pages > KV > Create a namespace** — nombre `PEDIDOS`.
2. **Workers & Pages > Create > Create Worker** — nombre `cafe-shopping-pedidos`, Deploy.
3. Editar el Worker: pegar el contenido de `worker.js`, Save and Deploy.
4. En el Worker, pestaña **Bindings > Add binding > KV namespace**:
   - Variable name: `PEDIDOS` (tiene que ser exactamente ese nombre, el codigo lo busca asi)
   - Namespace: el creado en el paso 1
5. En el Worker, **Settings > Variables and Secrets > Add**:
   - Nombre: `CLAVE_SECRETA`, tipo Secret, valor: la clave generada para este proyecto (no compartir).
6. La URL del Worker queda arriba de su pagina, forma
   `https://cafe-shopping-pedidos.<subdominio>.workers.dev`.
7. En la app, **Configuracion > Datos del negocio**, pegar esa URL y la
   misma clave del paso 5 en los campos "Pedidos web automaticos". La app
   guarda esto en su base de datos, no en un archivo — el negocio lo cambia
   el mismo cuando quiera, sin editar nada a mano.

## Punto de venta oculto del catalogo (opcional)

El catalogo tiene un punto de venta escondido: manteniendo pulsado el boton
"Filtros" 2 segundos aparece un cuadro para meter una clave, y con eso el
personal puede registrar una **venta real** desde el celular; esa venta cae
sola en la app (factura, stock, deuda si es a credito).

La clave de ese punto de venta es **otro secreto del mismo Worker**, aparte de
`CLAVE_SECRETA`:

1. Cloudflare -> tu Worker `cafe-shopping-pedidos` -> **Settings > Variables and
   Secrets > Add**.
2. Nombre: `CLAVE_POS`, tipo **Secret**, valor: una clave larga y dificil de
   adivinar (no la misma que `CLAVE_SECRETA`). No se comparte con clientes, solo
   con quien vaya a cobrar desde la web.
3. **Save and Deploy.**

Se puede cambiar cuando quieras desde ahi, sin regenerar el catalogo. Si
`CLAVE_POS` no esta puesta, el punto de venta oculto simplemente no funciona
(el cuadro dice "no esta configurado").

Limites automaticos contra saturacion (no hay que tocar nada):
- 5 intentos de clave por IP cada 10 min.
- 10 ventas por IP cada 10 min; 40 ventas por hora en total.
- Maximo 30 productos distintos por venta.
- La app procesa hasta 15 ventas web por ciclo y como mucho 60 al dia de forma
  automatica; si se pasa, las deja pendientes y avisa en el log.

## Piezas que hablan con esto

- `backend/src/catalogo/plantilla.ts` — el boton "Pedir por WhatsApp" del
  catalogo tambien avisa a este Worker (ademas de abrir WhatsApp, que sigue
  siendo el canal real con el cliente). La URL sale de BusinessProfile.
- `backend/src/web-orders/web-orders-relay.service.ts` — la app revisa este
  Worker cada pocos minutos y crea el pedido solo, usando el mismo parser que
  ya existe para pegar el mensaje a mano. Si Configuracion no tiene URL y
  clave puestas, esta pieza no hace nada.
