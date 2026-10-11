import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsPositive } from 'class-validator';
import { MetodoPago } from '../../common/enums';

export class RegisterPaymentDto {
  @ApiProperty({ example: 500 })
  @IsNumber()
  @IsPositive({ message: 'El monto del abono debe ser mayor a cero.' })
  amount: number;

  @ApiProperty({ enum: MetodoPago, default: MetodoPago.EFECTIVO })
  @IsEnum(MetodoPago)
  metodo: MetodoPago;
}
