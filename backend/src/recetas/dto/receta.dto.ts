import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CODIGOS_UNIDAD } from '../../common/unidades';

export class IngredienteDto {
  @ApiPropertyOptional({ description: 'Insumo de la linea (o subrecetaId, uno de los dos).' })
  @IsOptional()
  @IsString()
  insumoId?: string;

  @ApiPropertyOptional({ description: 'Subreceta de la linea (o insumoId, uno de los dos).' })
  @IsOptional()
  @IsString()
  subrecetaId?: string;

  @ApiProperty({ example: 500 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: 'La cantidad de cada ingrediente debe ser mayor a cero.' })
  cantidad: number;

  @ApiProperty({ example: 'g', enum: CODIGOS_UNIDAD })
  @IsIn(CODIGOS_UNIDAD, { message: 'Unidad invalida en un ingrediente.' })
  unidad: string;
}

export class CreateRecetaDto {
  @ApiProperty({ example: 'Bizcocho de vainilla 8"' })
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres.' })
  nombre: string;

  @ApiPropertyOptional({
    description: 'true = relleno, crema, masa... que se usa dentro de otras recetas.',
  })
  @IsOptional()
  @IsBoolean()
  esSubreceta?: boolean;

  @ApiProperty({ example: 1, description: 'Cuanto sale de una tanda.' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: 'El rendimiento debe ser mayor a cero.' })
  rendimiento: number;

  @ApiProperty({ example: 'unidad', enum: CODIGOS_UNIDAD })
  @IsIn(CODIGOS_UNIDAD, { message: 'Unidad de rendimiento invalida.' })
  unidadRendimiento: string;

  @ApiPropertyOptional({ example: 12, description: 'Porciones que da una tanda.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  porciones?: number | null;

  @ApiPropertyOptional({ example: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tiempoPreparacionMin?: number | null;

  @ApiPropertyOptional({ description: 'Pasos de preparacion (texto libre, uno por linea).' })
  @IsOptional()
  @IsString()
  pasos?: string;

  @ApiPropertyOptional({
    example: 80,
    description: 'Ganancia sobre el costo (%). Vacio = la del negocio.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000)
  margenPct?: number | null;

  @ApiPropertyOptional({ description: 'Producto terminado que produce esta receta.' })
  @IsOptional()
  @IsString()
  productoId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @ApiProperty({ type: [IngredienteDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'La receta debe tener al menos un ingrediente.' })
  @ValidateNested({ each: true })
  @Type(() => IngredienteDto)
  ingredientes: IngredienteDto[];
}
