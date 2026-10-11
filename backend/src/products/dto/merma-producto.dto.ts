import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class MermaProductoDto {
  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'La cantidad debe ser al menos 1.' })
  cantidad: number;

  @ApiPropertyOptional({ example: 'Pan del dia anterior' })
  @IsOptional()
  @IsString()
  motivo?: string;
}
