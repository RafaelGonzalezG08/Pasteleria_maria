import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class CortarPorcionesDto {
  @ApiProperty({ example: 1, description: 'Cuantos productos enteros se cortan.' })
  @Type(() => Number)
  @IsInt({ message: 'Indica cuantos enteros cortar.' })
  @Min(1, { message: 'Corta al menos 1.' })
  @Max(100)
  enteros: number;
}
