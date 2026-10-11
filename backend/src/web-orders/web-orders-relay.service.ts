import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WebOrdersService } from './web-orders.service';

interface PedidoRelevo {
  codigo: string;
  texto: string;
  creado: number;
}

/**
 * Revisa el relevo en la nube (ver /cloud-relay en la raiz del repo) cada
 * pocos minutos y crea solos los pedidos que el catalogo web fue dejando ahi
 * - lo mismo que hace un cajero al pegar el mensaje a mano, pero sin que
 * nadie tenga que hacerlo.
 *
 * La URL y la clave se guardan en Configuracion (BusinessProfile), no en una
 * variable de entorno: el negocio tiene que poder ponerlas el mismo desde la
 * app, sin editar archivos. Si no las ha puesto, esta clase no hace nada: el
 * negocio puede seguir usando solo "pegar el mensaje" sin que esto interfiera.
 */
@Injectable()
export class WebOrdersRelayService {
  private readonly logger = new Logger(WebOrdersRelayService.name);
  private revisando = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly webOrders: WebOrdersService,
  ) {}

  @Interval(3 * 60 * 1000)
  async revisar() {
    const perfil = await this.prisma.businessProfile.findFirst();
    const url = perfil?.relevoPedidosUrl?.trim();
    const clave = perfil?.relevoPedidosClave?.trim();
    if (!url || !clave) return;

    // Evita superponerse si una revision anterior todavia esta esperando la
    // red (conexion lenta, relevo caido) cuando toca la siguiente.
    if (this.revisando) return;
    this.revisando = true;

    try {
      const respuesta = await fetch(`${url.replace(/\/$/, '')}/pedidos`, {
        headers: { Authorization: `Bearer ${clave}` },
        // Sin esto, una peticion que se quede colgada (DNS que no resuelve,
        // el Worker sin responder, etc.) dejaria `revisando` en true para
        // siempre: la app se quedaria de por vida sin volver a revisar el
        // relevo, sin ningun error visible en ningun lado.
        signal: AbortSignal.timeout(15000),
      });
      if (!respuesta.ok) {
        this.logger.warn(
          `El relevo de pedidos respondio ${respuesta.status}; se reintenta en el proximo ciclo.`,
        );
        return;
      }

      const pedidos = (await respuesta.json()) as PedidoRelevo[];
      let creados = 0;

      for (const pedido of pedidos) {
        const resultado = await this.procesarUno(pedido, url, clave);
        if (resultado === 'creado') creados += 1;
      }

      if (creados > 0) {
        this.logger.log(`${creados} pedido(s) web creado(s) automaticamente desde el relevo.`);
      }
    } catch (error) {
      // Sin internet, el relevo caido, etc.: se reintenta solo en el
      // proximo ciclo. El pedido sigue disponible por WhatsApp mientras tanto.
      this.logger.warn(`No se pudo revisar el relevo de pedidos: ${error}`);
    } finally {
      this.revisando = false;
    }
  }

  /**
   * Crea el pedido. Solo se quita del relevo cuando ya no hace falta volver a
   * verlo: se creo, o ya existia (alguien lo pego a mano mientras tanto, o un
   * ciclo anterior lo creo pero fallo al borrarlo del relevo).
   *
   * Para cualquier OTRO error -- el texto no se pudo interpretar, la base de
   * datos no respondio, lo que sea -- el pedido se queda en el relevo para
   * reintentar en el proximo ciclo y se avisa en el log. Antes se borraba
   * igual pasara lo que pasara: un pedido que no se pudiera interpretar
   * (ej. la pagina del catalogo publicada quedo desactualizada respecto al
   * formato que este backend espera) desaparecia de Cloudflare para siempre
   * sin ningun rastro en ningun lado -- el pedido se perdia en silencio.
   */
  private async procesarUno(
    pedido: PedidoRelevo,
    url: string,
    clave: string,
  ): Promise<'creado' | 'duplicado' | 'error'> {
    let resultado: 'creado' | 'duplicado';
    try {
      await this.webOrders.create({ texto: pedido.texto });
      resultado = 'creado';
    } catch (error) {
      if (!(error instanceof ConflictException)) {
        this.logger.warn(
          `Pedido ${pedido.codigo} del relevo no se pudo crear (se reintentara): ${error}`,
        );
        return 'error';
      }
      resultado = 'duplicado';
    }

    try {
      await fetch(`${url.replace(/\/$/, '')}/pedidos/${encodeURIComponent(pedido.codigo)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${clave}` },
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      this.logger.warn(`No se pudo quitar ${pedido.codigo} del relevo (se reintentara): ${error}`);
    }

    return resultado;
  }
}
