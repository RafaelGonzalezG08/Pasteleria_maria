import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class DeleteWebOrderDto {
  @ApiProperty({
    description: 'Clave de quien elimina el pedido, como confirmacion extra antes de borrarlo.',
  })
  @IsString()
  @MinLength(1, { message: 'Debes ingresar tu clave.' })
  password: string;
}
