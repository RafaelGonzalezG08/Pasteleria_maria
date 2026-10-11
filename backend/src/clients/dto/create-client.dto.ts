import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateClientDto {
  @ApiProperty({ example: 'Juan Rodriguez' })
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres.' })
  nombre: string;

  @ApiProperty({ example: '+18095551234' })
  @IsString()
  @MinLength(7, { message: 'Ingresa un telefono valido (incluye codigo de pais).' })
  telefono: string;

  @ApiProperty({ required: false })
  // Un campo vacio ("" desde el formulario) no es lo mismo que "no enviado"
  // (undefined) para class-validator: @IsOptional() solo se salta la
  // validacion cuando el valor es null/undefined, no cuando es "". Por eso
  // convertimos "" a undefined antes de validar, para que el correo sea
  // realmente opcional y no se exija un formato valido si se deja en blanco.
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsOptional()
  @IsEmail({}, { message: 'El correo no es valido.' })
  email?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsOptional()
  @IsString()
  direccion?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsOptional()
  @IsString()
  notas?: string;
}
