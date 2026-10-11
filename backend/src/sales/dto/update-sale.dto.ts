import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SaleItemDto } from './create-sale.dto';

export class UpdateSaleDto {
  @ApiProperty({ description: 'Clave del usuario administrador que autoriza la correccion.' })
  @IsString()
  @MinLength(1, { message: 'Debes ingresar la clave del administrador.' })
  adminPassword: string;

  /**
   * A quien queda facturada la venta. Se corrige cuando el cajero eligio al
   * cliente equivocado (o se le olvido ponerlo) al cobrar.
   *
   * Tres casos distintos, a proposito:
   *   - se omite  -> no se toca el cliente actual
   *   - un id     -> la factura pasa a nombre de ese cliente
   *   - null      -> queda como "Consumidor final"
   * `@IsOptional()` de class-validator ignora tanto `undefined` como `null`,
   * asi que el null llega intacto al service y ahi se distingue de la omision.
   */
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Cliente al que se refactura. null = consumidor final. Omitirlo deja el cliente actual.',
  })
  @IsOptional()
  @IsString()
  clientId?: string | null;

  @ApiProperty({ type: [SaleItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'La venta debe tener al menos un item.' })
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];
}
