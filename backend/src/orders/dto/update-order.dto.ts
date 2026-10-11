import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';
import { EstadoPedido } from '../../common/enums';

export class UpdateOrderDto {
  @ApiPropertyOptional({
    enum: EstadoPedido,
    description:
      'Nuevo estado. Al marcar ENTREGADO el pedido se borra y la factura queda como el registro de la venta.',
  })
  @IsOptional()
  @IsEnum(EstadoPedido, { message: 'Estado de pedido invalido.' })
  estado?: EstadoPedido;

  @ApiPropertyOptional({
    description: 'Fecha prometida de entrega. Enviar cadena vacia para quitarla.',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'La fecha de entrega no es valida.' })
  fechaEntrega?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notas?: string;
}
