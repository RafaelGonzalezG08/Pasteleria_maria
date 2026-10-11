import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  EstadoEncargo,
  METODOS_PAGO,
  MetodoPago,
  TIPOS_ENTREGA,
  TipoEntrega,
} from '../../common/enums';

/** Metodos con los que se puede pagar un anticipo (el credito no es un pago). */
const METODOS_ABONO = METODOS_PAGO.filter((m) => m !== MetodoPago.CREDITO);

export class EncargoItemDto {
  @ApiPropertyOptional({ description: 'Producto del catalogo; vacio = articulo personalizado.' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiProperty({ example: 'Pastel de chocolate 10"' })
  @IsString()
  @MinLength(1, { message: 'Cada producto del encargo debe tener una descripcion.' })
  descripcion: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'La cantidad debe ser al menos 1.' })
  cantidad: number;

  @ApiProperty({ example: 2500 })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'El precio no puede ser negativo.' })
  precioUnitario: number;

  @ApiPropertyOptional({ example: '10 pulgadas, 2 pisos' })
  @IsOptional()
  @IsString()
  tamano?: string;

  @ApiPropertyOptional({ example: 'Chocolate' })
  @IsOptional()
  @IsString()
  sabor?: string;

  @ApiPropertyOptional({ example: 'Dulce de leche' })
  @IsOptional()
  @IsString()
  relleno?: string;

  @ApiPropertyOptional({ example: 'Flores de buttercream rosadas' })
  @IsOptional()
  @IsString()
  decoracion?: string;

  @ApiPropertyOptional({ example: 'Feliz cumpleaños Ana' })
  @IsOptional()
  @IsString()
  mensaje?: string;

  @ApiPropertyOptional({ description: 'Devuelta por POST /encargos/foto-referencia.' })
  @IsOptional()
  @IsString()
  fotoReferenciaUrl?: string;
}

export class PagoEncargoDto {
  @ApiProperty({ example: 1000 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: 'El monto debe ser mayor a cero.' })
  monto: number;

  @ApiProperty({ enum: METODOS_ABONO })
  @IsIn(METODOS_ABONO, { message: 'Metodo de pago invalido.' })
  metodo: MetodoPago;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nota?: string;
}

export class CreateEncargoDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Elige el cliente del encargo.' })
  clientId: string;

  @ApiProperty({ example: '2026-10-15T15:00', description: 'Fecha y hora de entrega.' })
  @IsISO8601({}, { message: 'La fecha de entrega no es valida.' })
  fechaEntrega: string;

  @ApiProperty({ enum: TIPOS_ENTREGA })
  @IsIn(TIPOS_ENTREGA, { message: 'Tipo de entrega invalido.' })
  tipoEntrega: TipoEntrega;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  direccionEntrega?: string;

  @ApiPropertyOptional({ example: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costoEnvio?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notas?: string;

  @ApiProperty({ type: [EncargoItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'El encargo debe tener al menos un producto.' })
  @ValidateNested({ each: true })
  @Type(() => EncargoItemDto)
  items: EncargoItemDto[];

  @ApiPropertyOptional({
    type: PagoEncargoDto,
    description: 'Anticipo recibido al hacer el encargo.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PagoEncargoDto)
  anticipo?: PagoEncargoDto;
}

export class UpdateEncargoDto extends CreateEncargoDto {}

export class CambiarEstadoDto {
  @ApiProperty({
    enum: [EstadoEncargo.PENDIENTE, EstadoEncargo.EN_PRODUCCION, EstadoEncargo.LISTO],
  })
  @IsIn([EstadoEncargo.PENDIENTE, EstadoEncargo.EN_PRODUCCION, EstadoEncargo.LISTO], {
    message: 'Estado invalido. Para entregar o cancelar usa sus botones.',
  })
  estado: EstadoEncargo;
}

export class CancelarEncargoDto {
  @ApiPropertyOptional({ example: 'El cliente cancelo la fiesta' })
  @IsOptional()
  @IsString()
  motivo?: string;
}

export class EntregarEncargoDto {
  @ApiPropertyOptional({ type: PagoEncargoDto, description: 'Pago del saldo al entregar.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PagoEncargoDto)
  pagoFinal?: PagoEncargoDto;

  @ApiPropertyOptional({
    description: 'Entregar aunque quede saldo: lo que falte pasa a Cobros como cuenta por cobrar.',
  })
  @IsOptional()
  @IsBoolean()
  dejarSaldoACredito?: boolean;

  @ApiPropertyOptional({ description: 'Fecha limite para pagar el saldo pendiente (YYYY-MM-DD).' })
  @IsOptional()
  @IsISO8601({}, { message: 'La fecha limite no es valida.' })
  fechaVencimiento?: string;
}
