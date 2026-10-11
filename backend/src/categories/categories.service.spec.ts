import { ConflictException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

/**
 * Al crear una categoria, las piezas del inventario cuya primera palabra
 * coincida con el nombre de la categoria deben quedar clasificadas en ella
 * (misma regla que al crear/editar una pieza). Sin esto, una categoria
 * creada despues de cargar el inventario se quedaba vacia.
 */
function crearService(over: { categoriasExistentes?: string[] } = {}) {
  const clasificarExistentesEn = jest.fn().mockResolvedValue(0);
  const prisma = {
    category: {
      findMany: jest
        .fn()
        .mockResolvedValue((over.categoriasExistentes ?? []).map((nombre) => ({ nombre }))),
      create: jest.fn(({ data }: any) => Promise.resolve({ id: 'cat-1', nombre: data.nombre })),
    },
  };
  const audit = { log: jest.fn() };
  const products = { clasificarExistentesEn };
  const service = new CategoriesService(prisma as any, audit as any, products as any);
  return { service, prisma, clasificarExistentesEn };
}

describe('CategoriesService.create', () => {
  it('clasifica en la categoria nueva las piezas existentes que aplican', async () => {
    const { service, clasificarExistentesEn } = crearService();
    clasificarExistentesEn.mockResolvedValue(3);

    const res = await service.create('Anillo');

    expect(clasificarExistentesEn).toHaveBeenCalledWith('cat-1', 'Anillo');
    expect(res).toMatchObject({ nombre: 'Anillo', clasificadas: 3 });
  });

  it('rechaza un nombre que ya existe sin importar mayusculas', async () => {
    const { service, clasificarExistentesEn } = crearService({ categoriasExistentes: ['Anillo'] });

    await expect(service.create('ANILLO')).rejects.toThrow(ConflictException);
    expect(clasificarExistentesEn).not.toHaveBeenCalled();
  });
});
