import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { TIPOS_INSUMO, TipoInsumo } from '../../common/enums';
import { CODIGOS_UNIDAD } from '../../common/unidades';

export class CreateInsumoDto {
  @ApiProperty({ example: 'Harina de trigo' })
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres.' })
  nombre: string;

  @ApiPropertyOptional({ enum: TIPOS_INSUMO, default: TipoInsumo.INGREDIENTE })
  @IsOptional()
  @IsIn(TIPOS_INSUMO, { message: 'Tipo de insumo invalido.' })
  tipo?: TipoInsumo;

  @ApiProperty({ example: 'kg', enum: CODIGOS_UNIDAD })
  @IsIn(CODIGOS_UNIDAD, { message: 'Unidad invalida.' })
  unidad: string;

  @ApiPropertyOptional({
    example: 5,
    description: 'Por debajo de esto sale la alerta de bajo inventario.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockMinimo?: number;

  @ApiPropertyOptional({ example: 45, description: 'Costo por unidad de stock.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'El costo no puede ser negativo.' })
  costoUnitario?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  proveedorId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notas?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

/** Al crear se puede indicar lo que ya hay en existencia (primer lote). */
export class CreateInsumoConStockDto extends CreateInsumoDto {
  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockInicial?: number;

  @ApiPropertyOptional({ description: 'Vencimiento del stock inicial (YYYY-MM-DD).' })
  @IsOptional()
  @IsISO8601({}, { message: 'La fecha de vencimiento no es valida.' })
  fechaVencimiento?: string;
}

export class UpdateInsumoDto extends PartialType(CreateInsumoDto) {}

export class MovimientoInsumoDto {
  @ApiProperty({
    enum: ['ENTRADA', 'SALIDA', 'MERMA', 'AJUSTE'],
    description: 'AJUSTE: `cantidad` es lo que hay contado fisicamente (el nuevo stock).',
  })
  @IsIn(['ENTRADA', 'SALIDA', 'MERMA', 'AJUSTE'], { message: 'Tipo de movimiento invalido.' })
  tipo: 'ENTRADA' | 'SALIDA' | 'MERMA' | 'AJUSTE';

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'La cantidad no puede ser negativa.' })
  cantidad: number;

  @ApiPropertyOptional({ description: 'Unidad de `cantidad`; si se omite, la del insumo.' })
  @IsOptional()
  @IsIn(CODIGOS_UNIDAD, { message: 'Unidad invalida.' })
  unidad?: string;

  @ApiPropertyOptional({
    description: 'Solo ENTRADA: costo por unidad (del insumo) de lo que entra.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costoUnitario?: number;

  @ApiPropertyOptional({ description: 'Solo ENTRADA: vencimiento del lote.' })
  @IsOptional()
  @IsISO8601({}, { message: 'La fecha de vencimiento no es valida.' })
  fechaVencimiento?: string;

  @ApiPropertyOptional({ example: 'Se derramo un saco' })
  @IsOptional()
  @IsString()
  motivo?: string;
}
