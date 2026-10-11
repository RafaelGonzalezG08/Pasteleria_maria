import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProveedoresService } from './proveedores.service';
import { CreateProveedorDto, UpdateProveedorDto } from './dto/proveedor.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums';

@ApiTags('proveedores')
@ApiBearerAuth()
@Controller('proveedores')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ProveedoresController {
  constructor(private readonly proveedores: ProveedoresService) {}

  // El repostero tambien los ve: el insumo muestra a quien se le compra.
  @Get()
  @Roles(Role.ADMIN, Role.REPOSTERO)
  findAll(@Query('all') all?: string) {
    return this.proveedores.findAll(all === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.proveedores.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateProveedorDto, @CurrentUser() user: AuthenticatedUser) {
    return this.proveedores.create(dto, user.userId);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProveedorDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.proveedores.update(id, dto, user.userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.proveedores.remove(id, user.userId);
  }
}
