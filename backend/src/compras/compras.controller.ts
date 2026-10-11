import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ComprasService } from './compras.service';
import { CreateCompraDto } from './dto/compra.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums';

@ApiTags('compras')
@ApiBearerAuth()
@Controller('compras')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ComprasController {
  constructor(private readonly compras: ComprasService) {}

  @Get()
  findAll(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('proveedorId') proveedorId?: string,
  ) {
    return this.compras.findAll({ from, to, proveedorId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.compras.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCompraDto, @CurrentUser() user: AuthenticatedUser) {
    return this.compras.create(dto, user.userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.compras.remove(id, user.userId);
  }
}
