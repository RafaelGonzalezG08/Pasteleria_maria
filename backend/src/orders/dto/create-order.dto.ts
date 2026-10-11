import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ description: 'Venta/factura a la que pertenece el pedido.' })
  @IsString()
  @MinLength(1, { message: 'Debes indicar la venta del pedido.' })
  saleId: string;

  @ApiPropertyOptional({ description: 'Fecha prometida de entrega al cliente (YYYY-MM-DD).' })
  @IsOptional()
  @IsISO8601({}, { message: 'La fecha de entrega no es valida.' })
  fechaEntrega?: string;

  @ApiPropertyOptional({ description: 'Nota interna (ej. "grabar iniciales", "ajustar size").' })
  @IsOptional()
  @IsString()
  notas?: string;
}
