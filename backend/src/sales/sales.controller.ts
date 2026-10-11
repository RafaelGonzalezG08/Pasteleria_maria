import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '../common/enums';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { DeleteSaleDto } from './dto/delete-sale.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { InvoicesService } from '../invoices/invoices.service';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly invoicesService: InvoicesService,
  ) {}

  @Post()
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.salesService.create(dto, user.userId);
  }

  @Get()
  findAll(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.salesService.findAll({ from, to, clientId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  /**
   * Corrige una venta/factura ya emitida (cantidad o precio mal digitado,
   * etc.). Solo ADMIN puede llamarlo, y ademas el service exige la clave del
   * admin en el body como confirmacion extra (ver UpdateSaleDto).
   */
  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSaleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.update(id, dto, user.userId);
  }

  /**
   * Elimina una venta/factura y devuelve las piezas al inventario. Mismas
   * salvaguardas que corregirla: ADMIN + clave del admin en el body.
   *
   * Se usa @Delete con body porque la confirmacion (la clave) tiene que
   * viajar en el cuerpo, no en la URL — un query param quedaria escrito en
   * los logs del servidor y en el historial del navegador.
   */
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  remove(
    @Param('id') id: string,
    @Body() dto: DeleteSaleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.remove(id, dto, user.userId);
  }

  @Post(':id/send-invoice-whatsapp')
  sendInvoiceWhatsapp(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoicesService.sendWhatsapp(id, user.userId);
  }
}
