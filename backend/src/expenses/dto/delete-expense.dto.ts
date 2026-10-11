import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class DeleteExpenseDto {
  @ApiProperty({
    description: 'Clave de quien elimina el gasto, como confirmacion extra antes de borrarlo.',
  })
  @IsString()
  @MinLength(1, { message: 'Debes ingresar tu clave.' })
  password: string;
}
