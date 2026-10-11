import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Clave actual, como confirmacion de identidad.' })
  @IsString()
  @MinLength(1, { message: 'Debes escribir tu clave actual.' })
  passwordActual: string;

  @ApiProperty({ description: 'Clave nueva (minimo 6 caracteres).' })
  @IsString()
  @MinLength(6, { message: 'La clave nueva debe tener al menos 6 caracteres.' })
  passwordNueva: string;
}
