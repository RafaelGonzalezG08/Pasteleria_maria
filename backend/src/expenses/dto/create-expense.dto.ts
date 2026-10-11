import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateExpenseDto {
  @ApiProperty({ required: false, description: 'Si se omite se usa la fecha actual' })
  @IsOptional()
  @IsISO8601()
  fecha?: string;

  @ApiProperty({ example: 'Suministros' })
  @IsString()
  @MinLength(2)
  categoria: string;

  @ApiProperty({ example: 'Compra de vasos y servilletas' })
  @IsString()
  @MinLength(2)
  descripcion: string;

  @ApiProperty({ example: 1500.0 })
  @IsNumber()
  @IsPositive({ message: 'El monto debe ser mayor a cero.' })
  monto: number;
}
