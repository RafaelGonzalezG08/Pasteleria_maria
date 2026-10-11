import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProduccionService } from './produccion.service';
import { RegistrarProduccionDto } from './dto/produccion.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums';
import { segunRol } from '../common/costos.util';

@ApiTags('produccion')
@ApiBearerAuth()
@Controller('produccion')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.REPOSTERO)
export class ProduccionController {
  constructor(private readonly produccion: ProduccionService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return segunRol(await this.produccion.findAll({ from, to }), user.role);
  }

  /** Encargos del dia y cuantas tandas hay que hacer de cada receta. */
  @Get('hoja')
  hoja(@Query('fecha') fecha?: string) {
    return this.produccion.hojaDelDia(fecha);
  }

  /** Insumos a comprar para los encargos de los proximos dias y para reponer minimos. */
  @Get('lista-compras')
  async listaCompras(@CurrentUser() user: AuthenticatedUser, @Query('dias') dias?: string) {
    return segunRol(await this.produccion.listaCompras(dias ? Number(dias) : 3), user.role);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return segunRol(await this.produccion.findOne(id), user.role);
  }

  @Post()
  async registrar(@Body() dto: RegistrarProduccionDto, @CurrentUser() user: AuthenticatedUser) {
    return segunRol(await this.produccion.registrar(dto, user.userId), user.role);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  anular(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.produccion.anular(id, user.userId);
  }
}
