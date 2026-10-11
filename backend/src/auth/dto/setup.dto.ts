import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

/** Datos del administrador que se crea en el primer arranque. */
export class SetupDto {
  @ApiProperty({ example: 'Maria Perez' })
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres.' })
  nombre: string;

  @ApiProperty({ example: 'maria@minegocio.com' })
  @IsEmail({}, { message: 'Debes ingresar un correo valido.' })
  email: string;

  @ApiProperty({ example: 'contraseña-segura' })
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres.' })
  password: string;
}
