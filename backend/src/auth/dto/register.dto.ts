import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '../../common/enums';

export class RegisterDto {
  @ApiProperty({ example: 'Maria Perez' })
  @IsString()
  @MinLength(2)
  nombre: string;

  @ApiProperty({ example: 'cajero@cafeshopping.com' })
  @IsEmail({}, { message: 'Debes ingresar un correo valido.' })
  email: string;

  @ApiProperty({ example: 'contraseña-segura' })
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres.' })
  password: string;

  @ApiProperty({ enum: Role, default: Role.CAJERO, required: false })
  @IsOptional()
  @IsEnum(Role, { message: 'Rol invalido. Usa ADMIN, CAJERO o CONTABILIDAD.' })
  role?: Role;
}
