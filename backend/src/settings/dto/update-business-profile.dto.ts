import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateBusinessProfileDto {
  @ApiProperty({ example: 'Cafe Shopping' })
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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  identifFiscal?: string;

  @ApiProperty({ example: 0.18 })
  @IsNumber()
  @Min(0)
  @Max(1)
  tasaImpuesto: number;

  @ApiProperty({
    required: false,
    description: 'Numero al que llegan los pedidos del catalogo web.',
  })
  @IsOptional()
  @IsString()
  telefonoWhatsapp?: string;

  @ApiProperty({ required: false, description: 'Frase corta bajo el nombre en el catalogo.' })
  @IsOptional()
  @IsString()
  descripcionWeb?: string;

  @ApiProperty({
    required: false,
    description: 'Como pagar por transferencia (banco, cuenta, titular).',
  })
  @IsOptional()
  @IsString()
  datosPago?: string;

  @ApiProperty({
    required: false,
    description: 'URL del relevo en la nube para automatizar Pedidos web.',
  })
  // No @IsOptional(): esa deja pasar undefined/null pero NO un string vacio,
  // y aqui el campo vacio ("no usar el relevo") es un valor valido -- por
  // eso la validacion de URL solo corre si de verdad viene algo escrito.
  // Sin esto, una URL mal tipeada (sin "https://", con un caracter raro)
  // se guardaba tal cual y el error salia recien 3 minutos despues, en un
  // log que nadie ve.
  @ValidateIf((o: UpdateBusinessProfileDto) => Boolean(o.relevoPedidosUrl))
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    {
      message:
        'La URL del relevo no es valida. Tiene que empezar con https:// y ser la direccion completa de tu Worker de Cloudflare.',
    },
  )
  relevoPedidosUrl?: string;

  @ApiProperty({
    required: false,
    description: 'Clave secreta del relevo (la misma puesta en Cloudflare).',
  })
  @IsOptional()
  @IsString()
  relevoPedidosClave?: string;

  @ApiProperty({
    required: false,
    description: 'Token de API de Cloudflare, con permiso "Cloudflare Pages: Edit" (para publicar el catalogo solo).',
  })
  @IsOptional()
  @IsString()
  cloudflareApiToken?: string;

  @ApiProperty({
    required: false,
    description: 'Account ID de Cloudflare (Overview del dashboard).',
  })
  @IsOptional()
  @IsString()
  cloudflareAccountId?: string;

  @ApiProperty({
    required: false,
    description: 'Nombre del proyecto de Cloudflare Pages donde se publica el catalogo.',
  })
  @IsOptional()
  @IsString()
  cloudflarePagesProject?: string;
}
