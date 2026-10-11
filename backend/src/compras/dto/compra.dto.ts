import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CODIGOS_UNIDAD } from '../../common/unidades';

export class CompraItemDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Cada linea debe tener un insumo.' })
  insumoId: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: 'La cantidad comprada debe ser mayor a cero.' })
  cantidad: number;

  @ApiProperty({ example: 'lb', enum: CODIGOS_UNIDAD })
  @IsIn(CODIGOS_UNIDAD, { message: 'Unidad invalida.' })
  unidad: string;

  @ApiProperty({ example: 180, description: 'Lo que se pago por esa linea completa.' })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'El costo no puede ser negativo.' })
  costoTotal: number;

  @ApiPropertyOptional({ description: 'Vencimiento del lote (YYYY-MM-DD).' })
  @IsOptional()
  @IsISO8601({}, { message: 'La fecha de vencimiento no es valida.' })
  fechaVencimiento?: string;
}

export class CreateCompraDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  proveedorId?: string;

  @ApiPropertyOptional({ description: 'Fecha de la compra; por defecto, hoy.' })
  @IsOptional()
  @IsISO8601({}, { message: 'La fecha no es valida.' })
  fecha?: string;

  @ApiPropertyOptional({ example: 'B0100000123' })
  @IsOptional()
  @IsString()
  numeroFactura?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notas?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Registrar tambien como gasto (para que el flujo de caja la cuente).',
  })
  @IsOptional()
  @IsBoolean()
  registrarGasto?: boolean;

  @ApiProperty({ type: [CompraItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'La compra debe tener al menos una linea.' })
  @ValidateNested({ each: true })
  @Type(() => CompraItemDto)
  items: CompraItemDto[];
}
