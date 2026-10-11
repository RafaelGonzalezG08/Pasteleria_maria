import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Aniversario, cumpleaños de un hijo... cualquier fecha que convenga recordar. */
export class FechaEspecialDto {
  @ApiProperty({ example: 'Aniversario de bodas' })
  @IsString()
  @MinLength(2, { message: 'Describe la fecha especial.' })
  descripcion: string;

  @ApiProperty({ example: '2026-05-14' })
  @IsISO8601({}, { message: 'Una de las fechas especiales no es valida.' })
  fecha: string;
}

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

  @ApiProperty({
    required: false,
    example: '1990-03-21',
    description: 'Cumpleaños (el año es opcional: usa 2000 si no se sabe).',
  })
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value))
  @IsOptional()
  @IsISO8601({}, { message: 'La fecha de cumpleaños no es valida.' })
  cumpleanos?: string | null;

  @ApiProperty({ required: false, type: [FechaEspecialDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FechaEspecialDto)
  fechasEspeciales?: FechaEspecialDto[];
}
