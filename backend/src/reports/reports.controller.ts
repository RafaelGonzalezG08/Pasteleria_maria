import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReportsService, GroupBy, TipoTransaccion } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.CONTABILIDAD)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.CONTABILIDAD, Role.CAJERO)
  dashboard() {
    return this.reportsService.dashboardSummary();
  }

  @Get('sales')
  sales(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('group') group: GroupBy = 'day',
  ) {
    return this.reportsService.salesByPeriod(from, to, group);
  }

  @Get('sales/export')
  async exportSales(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('group') group: GroupBy = 'day',
  ) {
    const data = await this.reportsService.salesByPeriod(from, to, group);
    const csv = this.reportsService.toCsv(data);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte-ventas.csv"');
    res.send(csv);
  }

  @Get('costs')
  @Roles(Role.ADMIN)
  productMargins(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.productMargins(from, to);
  }

  @Get('clients/debts')
  clientDebts() {
    return this.reportsService.clientDebts();
  }

  @Get('expenses')
  expenses(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.expensesByCategory(from, to);
  }

  @Get('cashflow')
  cashflow(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.cashflow(from, to);
  }

  @Get('transactions')
  transactions(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tipo') tipo?: string,
    @Query('metodoPago') metodoPago?: string,
    @Query('userId') userId?: string,
    @Query('q') q?: string,
  ) {
    return this.reportsService.transactions({
      from,
      to,
      tipo: parseTipos(tipo),
      metodoPago,
      userId,
      q,
    });
  }

  @Get('transactions/export')
  async exportTransactions(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tipo') tipo?: string,
    @Query('metodoPago') metodoPago?: string,
    @Query('userId') userId?: string,
    @Query('q') q?: string,
  ) {
    const { items } = await this.reportsService.transactions({
      from,
      to,
      tipo: parseTipos(tipo),
      metodoPago,
      userId,
      q,
    });
    const filas = items.map((t) => ({
      fecha: t.fecha.toISOString(),
      tipo: t.tipo,
      descripcion: t.descripcion,
      referencia: t.referencia ?? '',
      cliente: t.cliente ?? '',
      usuario: t.usuario ?? '',
      metodoPago: t.metodoPago ?? '',
      signo: t.signo,
      monto: t.monto,
    }));
    const csv = this.reportsService.toCsv(filas);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="transacciones.csv"');
    res.send(csv);
  }
}

function parseTipos(tipo?: string): TipoTransaccion[] | undefined {
  if (!tipo) return undefined;
  const validos: TipoTransaccion[] = ['VENTA', 'ABONO', 'GASTO'];
  const pedidos = tipo
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter((t): t is TipoTransaccion => (validos as string[]).includes(t));
  return pedidos.length > 0 ? pedidos : undefined;
}
