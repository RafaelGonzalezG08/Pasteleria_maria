import { Controller, Get, Param, Query, Res, UseGuards, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('integrations-status')
  integrationsStatus() {
    return this.invoicesService.integrationsStatus;
  }

  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Query('format') format: 'png' | 'pdf' = 'png',
    @Res() res: Response,
  ) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Factura no encontrada.');

    const url = format === 'pdf' ? invoice.pdfUrl : invoice.pngUrl;
    if (!url) {
      throw new NotFoundException(
        'La factura aun no ha sido generada en ese formato. Genera la venta primero.',
      );
    }
    return res.redirect(url);
  }
}
