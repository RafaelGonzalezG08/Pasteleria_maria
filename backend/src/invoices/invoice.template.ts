import { Prisma } from '@prisma/client';

type SaleWithRelations = Prisma.SaleGetPayload<{
  include: { items: true; client: true; user: { select: { nombre: true } }; payments: true };
}>;

interface BusinessInfo {
  nombre: string;
  logoUrl?: string | null;
  direccion?: string | null;
  identifFiscal?: string | null;
}

const money = (value: Prisma.Decimal | number) =>
  Number(value).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Fecha larga para el encabezado (una sola en toda la factura). */
const fecha = (date: Date) =>
  new Date(date).toLocaleDateString('es-DO', {
    dateStyle: 'long',
    timeZone: 'America/Santo_Domingo',
  });

/**
 * Fecha corta para la lista de abonos ("17 ago 2026").
 *
 * Antes se usaba el formato largo ("17 de agosto de 2026") tambien aqui, y en
 * una cuenta con varios abonos esas fechas competian por atencion con el dato
 * que de verdad importa: el saldo pendiente. Cortas, quedan como una nota al
 * margen.
 */
const fechaCorta = (date: Date) =>
  new Date(date)
    .toLocaleDateString('es-DO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'America/Santo_Domingo',
    })
    .replace('.', '');

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
  CREDITO: 'Credito',
  OTRO: 'Otro',
};

/**
 * Genera el HTML de la factura. Ancho angosto tipo recibo (380px) para que se
 * vea bien tanto en la vista previa del POS como al recibirla en WhatsApp en
 * un telefono (evita franjas negras arriba/abajo por ser demasiado ancha).
 *
 * Paleta: la MISMA del programa (rosa cuarzo / oro rosa / vino), definida en
 * frontend/tailwind.config.js. Antes la factura usaba un dorado de cafeteria
 * que no se parecia a nada de lo que el cliente ve en la app.
 *
 * Jerarquia visual segun el estado de la cuenta:
 *  - Venta al contado o a credito SIN abonos: el "Total" es lo mas grande.
 *  - Cuenta CON abonos: el "Total" se achica (ya es historia) y el "Saldo
 *    pendiente" pasa a ser el elemento dominante — es lo unico que el cliente
 *    necesita ver de un vistazo. Si la cuenta quedo saldada, ese mismo lugar
 *    lo ocupa "CUENTA SALDADA" en verde.
 */
export function renderInvoiceHtml(
  sale: SaleWithRelations,
  numero: string,
  business: BusinessInfo,
): string {
  const itemsRows = sale.items
    .map(
      (item) => `
        <tr>
          <td class="desc">${escapeHtml(item.descripcion)}</td>
          <td class="num">${item.cantidad}</td>
          <td class="num">${money(item.precioUnitario)}</td>
          <td class="num">${money(item.total)}</td>
        </tr>`,
    )
    .join('');

  // El descuento se aplica sobre la venta completa, no por linea: cada item
  // guarda su precio de lista tal cual, asi que el bruto sale de sumarlos.
  const bruto = sale.items.reduce((sum, item) => sum + Number(item.total), 0);
  const descuentoMonto = Math.max(0, bruto - Number(sale.subtotal));
  const descuentoPctTexto =
    Number(sale.descuentoPct) % 1 === 0
      ? Number(sale.descuentoPct).toFixed(0)
      : Number(sale.descuentoPct).toFixed(2);
  const hayDescuento = descuentoMonto > 0.004;
  const impuestosMonto = Number(sale.impuestos);
  const hayImpuestos = impuestosMonto > 0.004;
  // Solo se muestra el desglose (Subtotal / Descuento / Impuestos) si aporta
  // algo. Sin descuento ni impuestos, "Subtotal" y "Total" serian el mismo
  // numero repetido: se deja solo el Total.
  const mostrarDesglose = hayDescuento || hayImpuestos;

  const descuentoRow = hayDescuento
    ? `<div class="totals-row"><span>Descuento (${descuentoPctTexto}%)</span><span>-${money(descuentoMonto)}</span></div>`
    : '';
  const impuestosRow = hayImpuestos
    ? `<div class="totals-row"><span>Impuestos</span><span>${money(impuestosMonto)}</span></div>`
    : '';

  const totalPagado = sale.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const saldoPendiente = Math.max(0, Number(sale.total) - totalPagado);
  const esCredito = sale.metodoPago === 'CREDITO';
  const hayAbonos = sale.payments.length > 0;
  const mostrarPagos = esCredito || hayAbonos;
  const cuentaSaldada = saldoPendiente <= 0.01;
  // El "Total" se achica solo cuando ya hay abonos: ahi el numero que manda
  // es el saldo. En una venta a credito recien hecha (sin abonos) el Total
  // sigue siendo el protagonista.
  const totalDemovido = hayAbonos;

  const abonosRows = sale.payments
    .map(
      (p) => `
        <li class="abono">
          <span class="abono-fecha">${fechaCorta(p.fecha)}</span>
          <span class="abono-metodo">${escapeHtml(METODO_LABEL[p.metodo] ?? p.metodo)}</span>
          <span class="abono-monto">${money(p.amount)}</span>
        </li>`,
    )
    .join('');

  const saldoHero = cuentaSaldada
    ? `<div class="saldo-hero saldo-hero--ok">&#10003;&nbsp; Cuenta saldada</div>`
    : `<div class="saldo-hero saldo-hero--due">
        <span class="saldo-hero-label">Saldo pendiente</span>
        <span class="saldo-hero-amount">RD$ ${money(saldoPendiente)}</span>
      </div>`;

  // Bloque de abonos. Con al menos un abono se muestra la lista + un resumen
  // corto (factura / abonado) y el saldo grande. A credito sin abonos todavia,
  // solo una nota discreta: el Total de arriba ya dice cuanto se debe.
  const pagosSection = mostrarPagos
    ? `
    <div class="abonos-block">
      <div class="section-title">Abonos</div>
      ${
        hayAbonos
          ? `<ul class="abono-list">${abonosRows}</ul>
             <div class="abono-resumen">
               <div><span>Total de la factura</span><span>${money(sale.total)}</span></div>
               <div><span>Total abonado</span><span>- ${money(totalPagado)}</span></div>
             </div>
             ${saldoHero}`
          : `<div class="sin-abonos">Aun sin abonos. El saldo pendiente es el total de la factura.</div>`
      }
    </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color: #241019;
    background: #FBF2F1;
  }
  .ticket {
    width: 380px;
    margin: 0 auto;
    background: #FFFFFF;
    padding: 24px 22px 20px;
    border: 1px solid #E6C7C9;
    border-radius: 14px;
    position: relative;
  }
  .logo-corner {
    position: absolute; top: 20px; left: 20px;
    width: 54px; height: 54px;
    object-fit: contain; border-radius: 10px;
    border: 1px solid #F3E0E1;
  }
  .header { text-align: center; border-bottom: 2px solid #B75D66; padding-bottom: 14px; margin-bottom: 16px; }
  .brand { display: flex; flex-direction: column; align-items: center; gap: 5px; }
  .brand-name { font-size: 19px; font-weight: 700; letter-spacing: -0.01em; color: #241019; }
  .brand-meta { font-size: 11px; color: #93767C; }
  .invoice-meta { margin-top: 10px; font-size: 11px; color: #93767C; }
  .invoice-number { font-size: 15px; font-weight: 700; color: #96434C; letter-spacing: 0.02em; }
  .metodo-pago {
    display: inline-block; margin-top: 6px;
    background: #F8DCE6; color: #9C4468;
    font-size: 10.5px; font-weight: 600;
    padding: 3px 11px; border-radius: 999px;
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.09em; color: #B0929A; margin-bottom: 5px; }
  .client-block { margin-bottom: 15px; font-size: 12.5px; }
  .client-block .name { font-weight: 600; color: #241019; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  thead th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #B0929A; padding: 6px 3px; border-bottom: 1.5px solid #E6C7C9; }
  thead th.num, td.num { text-align: right; }
  tbody td { padding: 7px 3px; font-size: 12.5px; border-bottom: 1px dashed #F0DEDF; color: #3A2530; }
  td.desc { max-width: 150px; }

  .totals { width: 210px; margin-left: auto; font-size: 12.5px; color: #5C4750; }
  .totals-row { display: flex; justify-content: space-between; padding: 3px 0; }
  .totals-row.total {
    font-size: 17px; font-weight: 700; color: #241019;
    border-top: 2px solid #241019; margin-top: 6px; padding-top: 8px;
  }
  /* Ya hay abonos: el total es un dato de contexto, no el protagonista. */
  .totals-row.total.total--demoted {
    font-size: 12.5px; font-weight: 600; color: #93767C;
    border-top: 1px dashed #E6C7C9; margin-top: 5px; padding-top: 6px;
  }

  .abonos-block { margin-top: 16px; }
  .abono-list { list-style: none; margin: 0 0 8px; padding: 0; }
  .abono {
    display: flex; align-items: baseline; gap: 8px;
    padding: 5px 0; border-bottom: 1px dashed #F0DEDF;
    font-size: 12px;
  }
  .abono-fecha { color: #93767C; font-size: 10.5px; white-space: nowrap; }
  .abono-metodo { color: #5C4750; flex: 1; }
  .abono-monto { color: #241019; font-weight: 600; font-variant-numeric: tabular-nums; }
  .abono-resumen { font-size: 12px; color: #93767C; margin-bottom: 10px; }
  .abono-resumen > div { display: flex; justify-content: space-between; padding: 2px 0; }
  .sin-abonos { font-size: 12px; color: #93767C; }

  /* El elemento mas grande y contrastado de toda la factura cuando hay abonos. */
  .saldo-hero {
    margin-top: 4px;
    border-radius: 12px;
    padding: 14px 12px;
    text-align: center;
  }
  .saldo-hero--due { background: #F3D8DC; border: 1.5px solid #E3AEB7; }
  .saldo-hero--ok { background: #D2ECDD; border: 1.5px solid #A9D8BF; color: #075136; font-size: 16px; font-weight: 700; }
  .saldo-hero-label {
    display: block;
    font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em;
    color: #963A50; margin-bottom: 2px;
  }
  .saldo-hero-amount {
    display: block;
    font-size: 20px; font-weight: 800; letter-spacing: -0.01em;
    color: #63152C; font-variant-numeric: tabular-nums;
  }

  .footer { margin-top: 18px; padding-top: 12px; border-top: 1px dashed #E6C7C9; font-size: 10.5px; color: #B0929A; text-align: center; }
</style>
</head>
<body>
  <div class="ticket">
    ${business.logoUrl ? `<img class="logo-corner" src="${escapeHtml(business.logoUrl)}" alt="logo" />` : ''}
    <div class="header">
      <div class="brand">
        <div class="brand-name">${escapeHtml(business.nombre)}</div>
        ${business.direccion ? `<div class="brand-meta">${escapeHtml(business.direccion)}</div>` : ''}
        ${business.identifFiscal ? `<div class="brand-meta">RNC/ID Fiscal: ${escapeHtml(business.identifFiscal)}</div>` : ''}
      </div>
      <div class="invoice-meta">
        <div class="invoice-number">${escapeHtml(numero)}</div>
        <div>${fecha(sale.fecha)}</div>
        <div class="metodo-pago">${escapeHtml(METODO_LABEL[sale.metodoPago] ?? sale.metodoPago)}</div>
      </div>
    </div>

    <div class="client-block">
      <div class="section-title">Cliente</div>
      <div class="name">${escapeHtml(sale.client?.nombre ?? 'Consumidor final')}</div>
      ${sale.client?.telefono ? `<div>${escapeHtml(sale.client.telefono)}</div>` : ''}
    </div>

    <table>
      <thead>
        <tr>
          <th>Descripcion</th>
          <th class="num">Cant.</th>
          <th class="num">P. Unit.</th>
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <div class="totals">
      ${
        mostrarDesglose
          ? `<div class="totals-row"><span>Subtotal</span><span>${money(bruto)}</span></div>
             ${descuentoRow}
             ${impuestosRow}`
          : ''
      }
      <div class="totals-row total${totalDemovido ? ' total--demoted' : ''}">
        <span>Total</span>
        <span>${money(sale.total)}</span>
      </div>
    </div>

    ${pagosSection}

    <div class="footer">
      Atendido por ${escapeHtml(sale.user?.nombre ?? '-')} &middot; Gracias por su compra
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
