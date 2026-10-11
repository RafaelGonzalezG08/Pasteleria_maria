import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Anillo' })
  @IsString()
  @MinLength(1, { message: 'El nombre de la categoria no puede estar vacio.' })
  nombre: string;
}
