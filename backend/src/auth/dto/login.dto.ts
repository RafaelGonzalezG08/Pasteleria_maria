import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@cafeshopping.com' })
  @IsEmail({}, { message: 'Debes ingresar un correo valido.' })
  email: string;

  @ApiProperty({ example: 'contraseña-segura' })
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres.' })
  password: string;
}
