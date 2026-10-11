/**
 * Relevo en la nube para los pedidos del catalogo web.
 *
 * El catalogo (ver backend/src/catalogo/plantilla.ts) es una pagina estatica
 * sin servidor, y la app de escritorio corre local sin direccion publica: no
 * hay ningun lugar "en internet" donde un pedido pueda caer solo. Este Worker
 * es esa pieza minima que falta - solo guarda pedidos por un rato y los
 * entrega, nada mas. No sabe nada del negocio ni de sus datos.
 *
 * POST /pedidos       -> el catalogo manda un pedido nuevo (publico, sin clave:
 *                         el codigo y el texto no son datos sensibles, y una
 *                         clave aqui se veria en el codigo fuente de la pagina
 *                         de todas formas).
 * GET  /pedidos        -> la app de escritorio revisa que hay pendiente
 *                         (requiere la clave secreta).
 * DELETE /pedidos/:codigo -> la app confirma que ya lo creo, para no volver a
 *                         traerlo la proxima vez (requiere la clave secreta).
 *
 * Punto de venta oculto del catalogo (crea VENTAS reales, no solo pedidos):
 * POST /pos/verificar  -> valida la clave del punto de venta contra el secreto
 *                         CLAVE_POS. Rate-limit por IP contra fuerza bruta.
 * POST /pos/ventas     -> el catalogo (ya desbloqueado) manda una venta.
 *                         Revalida CLAVE_POS. Limites de saturacion por IP y
 *                         globales. Tope de 30 lineas por venta.
 * GET  /pos/ventas         -> la app revisa que ventas hay (requiere CLAVE_SECRETA).
 * DELETE /pos/ventas/:codigo -> la app confirma que ya la creo (requiere CLAVE_SECRETA).
 *
 * Requiere un KV Namespace llamado PEDIDOS enlazado a este Worker, una
 * variable secreta CLAVE_SECRETA y (para el punto de venta) CLAVE_POS.
 * Ver README de esta carpeta.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      // Sin esto, Cloudflare guardaba en cache la respuesta del GET y la app
      // seguia viendo "sin pedidos" durante un rato aunque ya hubiera uno
      // nuevo esperando - se detecto probando el flujo completo, no en la
      // teoria.
      'Cache-Control': 'no-store',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    function tieneClave() {
      const auth = request.headers.get('Authorization') || '';
      return auth === 'Bearer ' + env.CLAVE_SECRETA;
    }

    if (request.method === 'POST' && url.pathname === '/pedidos') {
      // Tope por IP: como este endpoint es publico (cualquiera podria mandarle
      // pedidos), esto evita que alguien llene la cola con cientos de pedidos
      // falsos de golpe. Un cliente real hace un pedido, no seis en 10
      // minutos - el limite es generoso a proposito para no estorbar a nadie
      // real.
      const ip = request.headers.get('CF-Connecting-IP') || 'desconocida';
      const claveLimite = 'limite:' + ip;
      const usados = Number((await env.PEDIDOS.get(claveLimite)) || '0');
      const LIMITE_POR_10_MIN = 5;
      if (usados >= LIMITE_POR_10_MIN) {
        return new Response('Demasiados pedidos seguidos. Espera unos minutos e intenta de nuevo.', {
          status: 429,
          headers: cors,
        });
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return new Response('JSON invalido', { status: 400, headers: cors });
      }
      const codigo = String(body.codigo || '').trim().toUpperCase();
      const texto = String(body.texto || '').trim();
      if (!/^PED-[A-Z0-9]{4,12}$/.test(codigo) || !texto || texto.length > 4000) {
        return new Response('Pedido invalido', { status: 400, headers: cors });
      }
      await env.PEDIDOS.put(claveLimite, String(usados + 1), { expirationTtl: 600 });
      await env.PEDIDOS.put('pedido:' + codigo, JSON.stringify({ codigo, texto, creado: Date.now() }));
      return new Response('ok', { status: 201, headers: cors });
    }

    if (request.method === 'GET' && url.pathname === '/pedidos') {
      if (!tieneClave()) return new Response('No autorizado', { status: 401, headers: cors });
      const lista = await env.PEDIDOS.list({ prefix: 'pedido:' });
      const pedidos = [];
      for (const key of lista.keys) {
        const valor = await env.PEDIDOS.get(key.name);
        if (valor) pedidos.push(JSON.parse(valor));
      }
      return new Response(JSON.stringify(pedidos), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'DELETE' && url.pathname.startsWith('/pedidos/')) {
      if (!tieneClave()) return new Response('No autorizado', { status: 401, headers: cors });
      const codigo = decodeURIComponent(url.pathname.split('/pedidos/')[1] || '').trim().toUpperCase();
      await env.PEDIDOS.delete('pedido:' + codigo);
      return new Response('ok', { headers: cors });
    }

    // ---- Punto de venta oculto ----

    const ipCliente = request.headers.get('CF-Connecting-IP') || 'desconocida';
    const json = (obj, status) =>
      new Response(JSON.stringify(obj), {
        status: status || 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });

    /** Cuenta un uso y devuelve true si ya se paso del limite. */
    async function pasoLimite(clave, tope, ttl) {
      const usados = Number((await env.PEDIDOS.get(clave)) || '0');
      if (usados >= tope) return true;
      await env.PEDIDOS.put(clave, String(usados + 1), { expirationTtl: ttl });
      return false;
    }

    if (request.method === 'POST' && url.pathname === '/pos/verificar') {
      if (!env.CLAVE_POS) return json({ ok: false, motivo: 'no-configurado' }, 503);
      // Freno de fuerza bruta: 5 intentos por IP cada 10 min.
      if (await pasoLimite('pos-int:' + ipCliente, 5, 600)) {
        return json({ ok: false, motivo: 'demasiados-intentos' }, 429);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false }, 400);
      }
      if (String(body.clave || '') !== env.CLAVE_POS) {
        return json({ ok: false }, 401);
      }
      return json({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/pos/ventas') {
      if (!env.CLAVE_POS) return json({ ok: false, motivo: 'no-configurado' }, 503);

      const crudo = await request.text();
      if (crudo.length > 8192) return new Response('Venta demasiado grande', { status: 413, headers: cors });
      let body;
      try {
        body = JSON.parse(crudo);
      } catch {
        return new Response('JSON invalido', { status: 400, headers: cors });
      }
      if (String(body.clave || '') !== env.CLAVE_POS) {
        return new Response('No autorizado', { status: 401, headers: cors });
      }

      const codigo = String(body.codigo || '').trim().toUpperCase();
      const venta = body.venta;
      if (!/^VNT-[A-Z0-9]{4,12}$/.test(codigo)) {
        return new Response('Codigo invalido', { status: 400, headers: cors });
      }
      if (!venta || !Array.isArray(venta.items) || venta.items.length === 0 || venta.items.length > 30) {
        return new Response('Venta invalida (0-30 productos)', { status: 400, headers: cors });
      }
      for (const it of venta.items) {
        const c = Number(it && it.cantidad);
        if (!Number.isInteger(c) || c < 1 || c > 999) {
          return new Response('Cantidad invalida', { status: 400, headers: cors });
        }
        if (it && it.talla != null && (typeof it.talla !== 'string' || it.talla.length > 20)) {
          return new Response('Size invalido', { status: 400, headers: cors });
        }
      }

      // Limites de saturacion: 10 ventas por IP cada 10 min, y un techo global
      // de 40 por hora pase lo que pase.
      if (await pasoLimite('pos-lim:' + ipCliente, 10, 600)) {
        return new Response('Demasiadas ventas seguidas. Espera unos minutos.', { status: 429, headers: cors });
      }
      const horaUTC = new Date().toISOString().slice(0, 13);
      if (await pasoLimite('pos-glob:' + horaUTC, 40, 3600)) {
        return new Response('Se alcanzo el limite de ventas de esta hora.', { status: 429, headers: cors });
      }

      await env.PEDIDOS.put('venta:' + codigo, JSON.stringify({ codigo, venta, creado: Date.now() }));
      return new Response('ok', { status: 201, headers: cors });
    }

    if (request.method === 'GET' && url.pathname === '/pos/ventas') {
      if (!tieneClave()) return new Response('No autorizado', { status: 401, headers: cors });
      const lista = await env.PEDIDOS.list({ prefix: 'venta:' });
      const ventas = [];
      for (const key of lista.keys) {
        const valor = await env.PEDIDOS.get(key.name);
        if (valor) ventas.push(JSON.parse(valor));
      }
      return new Response(JSON.stringify(ventas), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'DELETE' && url.pathname.startsWith('/pos/ventas/')) {
      if (!tieneClave()) return new Response('No autorizado', { status: 401, headers: cors });
      const codigo = decodeURIComponent(url.pathname.split('/pos/ventas/')[1] || '').trim().toUpperCase();
      await env.PEDIDOS.delete('venta:' + codigo);
      return new Response('ok', { headers: cors });
    }

    return new Response('No encontrado', { status: 404, headers: cors });
  },
};
