import { parsearPedidoWeb } from './parser';

describe('parsearPedidoWeb', () => {
  const mensajeCompleto = `Hola! Quiero hacer este pedido *#PED-K3F7Q2*:

2 x Anillo oro 18k (AN-0001) - RD$ 3,000.00
1 x Cadena plata (CA-0002) - RD$ 900.00

Total: RD$ 3,900.00`;

  it('interpreta un mensaje bien formado', () => {
    const r = parsearPedidoWeb(mensajeCompleto);
    expect(r).not.toBeNull();
    expect(r!.codigo).toBe('PED-K3F7Q2');
    expect(r!.total).toBe(3900);
    expect(r!.items).toHaveLength(2);
    expect(r!.items[0]).toEqual({
      cantidad: 2,
      nombre: 'Anillo oro 18k',
      sku: 'AN-0001',
      total: 3000,
    });
    expect(r!.items[1]).toEqual({
      cantidad: 1,
      nombre: 'Cadena plata',
      sku: 'CA-0002',
      total: 900,
    });
  });

  it('acepta el codigo sin los asteriscos de negrita (se pierden al copiar)', () => {
    const r = parsearPedidoWeb(mensajeCompleto.replace(/\*/g, ''));
    expect(r?.codigo).toBe('PED-K3F7Q2');
  });

  it('normaliza el codigo a mayusculas', () => {
    const r = parsearPedidoWeb(mensajeCompleto.replace('PED-K3F7Q2', 'ped-k3f7q2'));
    expect(r?.codigo).toBe('PED-K3F7Q2');
  });

  it('lee montos con y sin separador de miles', () => {
    const r = parsearPedidoWeb(`#PED-ABCD:
1 x Dije (DJ-1) - RD$ 1500.50
Total: RD$ 1500.50`);
    expect(r?.items[0].total).toBe(1500.5);
    expect(r?.total).toBe(1500.5);
  });

  it('ignora lineas que no son items y notas al final', () => {
    const r = parsearPedidoWeb(`#PED-NOTA:
1 x Aretes (AR-9) - RD$ 500.00
Total: RD$ 500.00

Los quiero en dorado por favor, gracias!`);
    expect(r?.items).toHaveLength(1);
    expect(r?.total).toBe(500);
  });

  it('devuelve null si falta el codigo', () => {
    expect(
      parsearPedidoWeb(`1 x Anillo (AN-1) - RD$ 100.00
Total: RD$ 100.00`),
    ).toBeNull();
  });

  it('devuelve null si falta el total', () => {
    expect(parsearPedidoWeb(`#PED-SINTOT:\n1 x Anillo (AN-1) - RD$ 100.00`)).toBeNull();
  });

  it('devuelve null si no hay ningun item reconocible', () => {
    expect(parsearPedidoWeb(`#PED-VACIO:\nTotal: RD$ 0.00`)).toBeNull();
  });

  it('devuelve null con texto vacio o basura', () => {
    expect(parsearPedidoWeb('')).toBeNull();
    expect(parsearPedidoWeb('   ')).toBeNull();
    expect(parsearPedidoWeb('hola, como estas?')).toBeNull();
  });
});
