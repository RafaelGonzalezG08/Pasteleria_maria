import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Usuario de sistema (no inicia sesion) al que se atribuyen las ventas del
 * catalogo web. Lo inserta la migracion 20260905120100_usuario_ventas_web en
 * TODA base, incluida una recien creada -- por eso no cuenta como "ya hay
 * usuarios" al decidir si la instalacion necesita crear su administrador
 * (ver AuthService.necesitaConfiguracionInicial).
 */
export const EMAIL_USUARIO_VENTAS_WEB = 'ventas-web@cafeshopping.local';

/**
 * Deja la base utilizable la primera vez que se abre la aplicacion.
 *
 * NO crea ningun usuario: el administrador lo crea el dueño en la pantalla
 * de primer arranque (AuthService.configuracionInicial). Antes se sembraba un
 * admin con una clave publica, y en una instalacion nueva ese usuario "demo"
 * ni siquiera existia o no coincidia con el que el cliente recordaba.
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
