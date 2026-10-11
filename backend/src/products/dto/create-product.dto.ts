import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @ApiPropertyOptional({
    example: 'PA-0001',
    description: 'Si se omite, se genera a partir del nombre (2 letras + numero secuencial).',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  sku?: string;

  @ApiProperty({ example: 'Pastel de chocolate 8"' })
  @IsString()
  @MinLength(2)
  nombre: string;

  @ApiProperty({ example: 1800.0 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: 'El precio debe ser mayor a cero.' })
  precioUnitario: number;

  @ApiPropertyOptional({
    example: 650.0,
    description:
      'Costo de producir una unidad (solo ADMIN). Si el producto tiene receta, se calcula solo.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costoUnitario?: number;

  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock: number;

  @ApiPropertyOptional({ description: 'Categoria (pasteles, panes, bizcochos, postres...).' })
  @IsOptional()
  @IsString()
  categoriaId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descripcion?: string;

  /**
   * Producto dado de baja (`false`) o vigente (`true`). El formulario viaja
   * como multipart (lleva la foto), donde TODO llega como texto: sin el
   * Transform, "false" seria un string truthy.
   */
  @ApiPropertyOptional({ description: 'false da de baja el producto (deja de venderse).' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value === 'true' : value))
  @IsBoolean()
  activo?: boolean;
}
