import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { EstadoPedidoWeb, ESTADOS_PEDIDO_WEB } from '../../common/enums';

export class UpdateWebOrderDto {
  @ApiProperty({ enum: ESTADOS_PEDIDO_WEB, example: EstadoPedidoWeb.ATENDIDO })
  @IsIn(ESTADOS_PEDIDO_WEB, { message: 'Estado invalido.' })
  estado: EstadoPedidoWeb;
}
