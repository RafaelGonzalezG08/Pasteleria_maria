import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InsumosService } from './insumos.service';
import { CreateInsumoConStockDto, MovimientoInsumoDto, UpdateInsumoDto } from './dto/insumo.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums';
import { parseFromDate, parseToDate } from '../common/date-range';
import { segunRol } from '../common/costos.util';

@ApiTags('insumos')
@ApiBearerAuth()
@Controller('insumos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.REPOSTERO)
export class InsumosController {
  constructor(private readonly insumos: InsumosService) {}

  @Get()
  async findAll(@Query('all') all: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return segunRol(await this.insumos.findAll(all === 'true'), user.role);
  }

  /** Bajo inventario y vencimientos. Tambien lo consulta el Dashboard del cajero. */
  @Get('alertas')
  @Roles(Role.ADMIN, Role.REPOSTERO, Role.CAJERO)
  alertas() {
    return this.insumos.alertas();
  }

  @Get('movimientos')
  async movimientos(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tipo') tipo?: string,
    @Query('insumoId') insumoId?: string,
  ) {
    const lista = await this.insumos.movimientos({
      from: from ? parseFromDate(from) : undefined,
      to: to ? parseToDate(to) : undefined,
      tipo: tipo || undefined,
      insumoId: insumoId || undefined,
    });
    return segunRol(lista, user.role);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return segunRol(await this.insumos.findOne(id), user.role);
  }

  @Post()
  async create(@Body() dto: CreateInsumoConStockDto, @CurrentUser() user: AuthenticatedUser) {
    return segunRol(await this.insumos.create(dto, user.userId), user.role);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInsumoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // El costo lo fija ADMIN (o lo actualizan las compras); el repostero no lo ve.
    if (user.role !== Role.ADMIN) delete dto.costoUnitario;
    return segunRol(await this.insumos.update(id, dto, user.userId), user.role);
  }

  @Post(':id/movimientos')
  async movimiento(
    @Param('id') id: string,
    @Body() dto: MovimientoInsumoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.role !== Role.ADMIN) delete dto.costoUnitario;
    return segunRol(await this.insumos.registrarMovimiento(id, dto, user.userId), user.role);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.insumos.remove(id, user.userId);
  }
}
