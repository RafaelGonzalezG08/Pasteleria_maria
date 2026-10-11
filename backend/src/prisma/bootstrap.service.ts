import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Deja la base utilizable la primera vez que se abre la aplicacion.
 *
 * NO crea ningun usuario: el administrador lo crea el dueño en la pantalla
 * de primer arranque (AuthService.configuracionInicial), y despues el puede
 * agregar mas usuarios desde Configuracion.
 *
 * Es seguro que corra en cada arranque (tambien al actualizar): solo crea el
 * perfil del negocio si falta y nunca toca usuarios ni datos existentes.
 */
@Injectable()
export class BootstrapService {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ensureInitialData(): Promise<void> {
    // El perfil del negocio es una fila unica que la pantalla de Configuracion
    // espera encontrar; sin ella la factura sale sin encabezado.
    const perfiles = await this.prisma.businessProfile.count();
    if (perfiles === 0) {
      await this.prisma.businessProfile.create({ data: {} });
      this.logger.log('Se creo el perfil del negocio con los valores por defecto.');
    }
  }
}
