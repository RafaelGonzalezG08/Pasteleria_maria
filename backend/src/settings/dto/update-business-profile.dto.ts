import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateBusinessProfileDto {
  @ApiProperty({ example: 'Pastelería María' })
  @IsString()
  @MinLength(2)
  nombre: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  direccion?: string;

  @ApiProperty({ required: false, example: '809-555-0000' })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiProperty({ required: false, description: 'RNC del negocio.' })
  @IsOptional()
  @IsString()
  identifFiscal?: string;

  @ApiProperty({ example: 'RD$', description: 'Simbolo de la moneda.' })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Indica el simbolo de la moneda.' })
  @MaxLength(6, { message: 'El simbolo de la moneda es demasiado largo.' })
  moneda?: string;

  @ApiProperty({ example: 'ITBIS' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  nombreImpuesto?: string;

  @ApiProperty({ example: 0.18 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  tasaImpuesto: number;

  @ApiProperty({
    example: 60,
    description: 'Ganancia sobre el costo (%) para el precio sugerido de las recetas.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000)
  margenGananciaPct?: number;

  @ApiProperty({
    example: 2,
    description: 'Avisar de los encargos que se entregan dentro de N dias.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  diasAlertaEncargos?: number;

  @ApiProperty({ example: 7, description: 'Avisar de los insumos que vencen dentro de N dias.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  diasAlertaVencimiento?: number;

  @ApiProperty({
    example: 7,
    description: 'Avisar de los cumpleaños de clientes dentro de N dias.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  diasAlertaCumpleanos?: number;
}
