import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class DeletePaymentDto {
  @ApiProperty({
    description:
      'Clave de quien elimina el abono, como confirmacion extra: borrarlo mueve el saldo pendiente del cliente y puede reabrir una cuenta que ya estaba saldada.',
  })
  @IsString()
  @MinLength(1, { message: 'Debes ingresar tu clave.' })
  password: string;
}
