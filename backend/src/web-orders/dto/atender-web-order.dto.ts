import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { MetodoPago } from '../../common/enums';

/**
 * Lo que hace falta para convertir un pedido web en una venta real: lo mismo
 * que se pide al cobrar en el punto de venta (cliente, metodo de pago, si es
 * un pedido por entregar). Los items NO se piden aqui: salen del pedido web
 * tal como el cliente los mando (ver web-orders.service.ts -> atender()).
 */
export class AtenderWebOrderDto {
  @ApiPropertyOptional({
    description: 'Cliente al que se factura (requerido si metodoPago=CREDITO)',
  })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiProperty({ enum: MetodoPago })
  @IsEnum(MetodoPago, { message: 'Metodo de pago invalido.' })
  metodoPago: MetodoPago;

  @ApiPropertyOptional({ description: 'Fecha limite de pago si metodoPago=CREDITO' })
  @IsOptional()
  @IsISO8601({}, { message: 'La fecha de vencimiento no es valida.' })
  fechaVencimiento?: string;

  @ApiPropertyOptional({ description: 'Marca la venta como pedido por entregar.' })
  @IsOptional()
  esPedido?: boolean;

  @ApiPropertyOptional({ description: 'Fecha prometida de entrega, si es un pedido.' })
  @IsOptional()
  @IsISO8601({}, { message: 'La fecha de entrega no es valida.' })
  fechaEntrega?: string;

  @ApiPropertyOptional({
    description: 'Descuento sobre el bruto de la venta, en porcentaje (0-100).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'El descuento no puede ser negativo.' })
  @Max(100, { message: 'El descuento no puede ser mayor a 100%.' })
  descuentoPct?: number;
}
