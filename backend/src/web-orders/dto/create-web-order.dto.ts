import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateWebOrderDto {
  @ApiProperty({
    description: 'Mensaje de WhatsApp que el cliente mando desde el catalogo web, pegado tal cual.',
  })
  @IsString()
  @MinLength(1, { message: 'Pega el mensaje del pedido.' })
  texto: string;
}
