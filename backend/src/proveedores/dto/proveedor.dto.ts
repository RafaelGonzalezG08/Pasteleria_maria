import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateProveedorDto {
  @ApiProperty({ example: 'Molinos del Norte' })
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres.' })
  nombre: string;

  @ApiPropertyOptional({ example: 'Juan (vendedor)' })
  @IsOptional()
  @IsString()
  contacto?: string;

  @ApiPropertyOptional({ example: '809-555-0101' })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  direccion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notas?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdateProveedorDto extends PartialType(CreateProveedorDto) {}
