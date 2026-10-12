import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MinLength,
} from 'class-validator';

export class RegistrarProduccionDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Elige la receta que se produjo.' })
  recetaId: string;

  @ApiProperty({
    example: 2,
    description: 'Cuantas veces se hizo la receta (puede ser 0.5, 2.5...).',
  })
  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: 'Las tandas deben ser mayores a cero.' })
  @Max(1000)
  tandas: number;

  @ApiPropertyOptional({ description: 'Fecha y hora de la produccion; por defecto, ahora.' })
  @IsOptional()
  @IsISO8601({}, { message: 'La fecha no es valida.' })
  fecha?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notas?: string;

  @ApiPropertyOptional({
    description:
      'Producir directamente en porciones: id del producto "porcion" del producto de la receta. ' +
      'Vacio = sale como enteros.',
  })
  @IsOptional()
  @IsString()
  porcionId?: string;
}
