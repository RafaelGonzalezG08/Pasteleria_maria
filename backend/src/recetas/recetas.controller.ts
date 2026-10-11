import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RecetasService } from './recetas.service';
import { CreateRecetaDto } from './dto/receta.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums';
import { segunRol } from '../common/costos.util';

@ApiTags('recetas')
@ApiBearerAuth()
@Controller('recetas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.REPOSTERO)
export class RecetasController {
  constructor(private readonly recetas: RecetasService) {}

  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return segunRol(await this.recetas.findAll(), user.role);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return segunRol(await this.recetas.findOne(id), user.role);
  }

  /** Receta escalada (ej. factor=5 para hacer 5 pasteles) con lo que falta de inventario. */
  @Get(':id/escalar')
  async escalar(
    @Param('id') id: string,
    @Query('factor') factor: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return segunRol(await this.recetas.escalar(id, Number(factor)), user.role);
  }

  @Post()
  async create(@Body() dto: CreateRecetaDto, @CurrentUser() user: AuthenticatedUser) {
    return segunRol(await this.recetas.create(dto, user.userId), user.role);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: CreateRecetaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return segunRol(await this.recetas.update(id, dto, user.userId), user.role);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.recetas.remove(id, user.userId);
  }
}
