import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MetodoPago } from '../../common/enums';

export class SaleItemDto {
  @ApiProperty({ required: false, description: 'ID del producto si viene del catalogo' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiProperty({ example: 'Cafe con leche 12oz' })
  @IsString()
  descripcion: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'La cantidad debe ser al menos 1.' })
  cantidad: number;

  @ApiProperty({ example: 120.0 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: 'El precio unitario debe ser mayor a cero.' })
  precioUnitario: number;
}

export class CreateSaleDto {
  @ApiProperty({
    required: false,
    description: 'Cliente asociado (requerido si metodoPago=CREDITO)',
  })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiProperty({ enum: MetodoPago })
  @IsEnum(MetodoPago, { message: 'Metodo de pago invalido.' })
  metodoPago: MetodoPago;

  @ApiProperty({ type: [SaleItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'La venta debe tener al menos un item.' })
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @ApiProperty({
    required: false,
    description: 'Tasa de impuesto a aplicar (0.18 = 18%). Si se omite se usa la tasa del negocio.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tasaImpuesto?: number;

  @ApiProperty({
    required: false,
    description: 'Descuento sobre el bruto de la venta, en porcentaje (0-100).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'El descuento no puede ser negativo.' })
  @Max(100, { message: 'El descuento no puede ser mayor a 100%.' })
  descuentoPct?: number;

  @ApiProperty({ required: false, description: 'Fecha limite de pago si metodoPago=CREDITO' })
  @IsOptional()
  @IsISO8601()
  fechaVencimiento?: string;

  @ApiProperty({
    required: false,
    default: true,
    description: 'Genera automaticamente el PNG de la factura al crear la venta',
  })
  @IsOptional()
  generarFactura?: boolean;

  @ApiProperty({
    required: false,
    description:
      'Marca la venta como pedido por entregar (queda en el registro de Pedidos hasta que se entregue).',
  })
  @IsOptional()
  esPedido?: boolean;

  @ApiProperty({ required: false, description: 'Fecha prometida de entrega, si es un pedido.' })
  @IsOptional()
  @IsISO8601({}, { message: 'La fecha de entrega no es valida.' })
  fechaEntrega?: string;

  @ApiProperty({
    required: false,
    description:
      'Codigo (VNT-XXXX) de la venta hecha desde el punto de venta del catalogo web. ' +
      'Uso interno del relevo; unico, evita crear la misma venta dos veces.',
  })
  @IsOptional()
  @IsString()
  webCodigo?: string;
}
