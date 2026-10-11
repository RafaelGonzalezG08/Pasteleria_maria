import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = (res as any)?.message || exception.message;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Errores conocidos de la base de datos. Sin esto llegaban al cliente
      // como un 500 "Ocurrio un error inesperado en el servidor" sin ninguna
      // pista de que fue. Los mas comunes se traducen a un mensaje que el
      // cajero puede entender; el resto queda como 400 con el codigo, que ya
      // es infinitamente mas util que el 500 anonimo.
      status = HttpStatus.BAD_REQUEST;
      message = traducirErrorPrisma(exception);
    } else if (
      exception instanceof Prisma.PrismaClientValidationError ||
      exception instanceof Prisma.PrismaClientUnknownRequestError
    ) {
      status = HttpStatus.BAD_REQUEST;
      message = 'La operacion no se pudo completar por un problema con los datos enviados.';
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Ocurrio un error inesperado en el servidor.';
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Aunque se devuelva 4xx, dejar rastro en el log: es un sintoma de que
      // algo en los datos no esta como el codigo espera.
      this.logger.warn(
        `${request.method} ${request.url} -> ${status} (Prisma ${exception.code}) ${JSON.stringify(exception.meta ?? {})}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      message,
    });
  }
}

function traducirErrorPrisma(error: Prisma.PrismaClientKnownRequestError): string {
  const campo = Array.isArray(error.meta?.target)
    ? (error.meta.target as string[]).join(', ')
    : String(error.meta?.target ?? '');

  switch (error.code) {
    case 'P2002':
      return campo.includes('numero')
        ? 'Se intento crear una factura con un numero que ya existe. Vuelve a intentarlo; si sigue pasando, avisa para revisar la numeracion.'
        : `Ya existe un registro con ese valor${campo ? ` (${campo})` : ''}.`;
    case 'P2003':
      return 'La operacion hace referencia a un registro que ya no existe (cliente, producto o venta borrada).';
    case 'P2025':
      return 'El registro que intentas modificar ya no existe.';
    default:
      return `No se pudo completar la operacion en la base de datos (${error.code}).`;
  }
}
