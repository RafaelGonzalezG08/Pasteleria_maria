import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class DeleteSaleDto {
  @ApiProperty({
    description:
      'Clave del administrador que autoriza la eliminacion. Se pide igual que al corregir una factura: borrar una venta afecta reportes, inventario y posibles deudas.',
  })
  @IsString()
  @MinLength(1, { message: 'Debes ingresar la clave del administrador.' })
  adminPassword: string;
}
