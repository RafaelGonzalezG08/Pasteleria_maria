import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EstadoPedidoWeb } from '../common/enums';
import { WebOrdersService } from './web-orders.service';
import { CreateWebOrderDto } from './dto/create-web-order.dto';
import { UpdateWebOrderDto } from './dto/update-web-order.dto';
import { AtenderWebOrderDto } from './dto/atender-web-order.dto';
import { DeleteWebOrderDto } from './dto/delete-web-order.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('web-orders')
@ApiBearerAuth()
@Controller('web-orders')
@UseGuards(JwtAuthGuard)
export class WebOrdersController {
  constructor(private readonly webOrdersService: WebOrdersService) {}

  @Get()
  findAll(@Query('estado') estado?: EstadoPedidoWeb) {
    return this.webOrdersService.findAll(estado);
  }

  /** Pega el mensaje de WhatsApp del cliente y crea el pedido. */
  @Post()
  create(@Body() dto: CreateWebOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.webOrdersService.create(dto, user.userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWebOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.webOrdersService.update(id, dto, user.userId);
  }

  /** Convierte el pedido en una venta real (cliente, metodo de pago, etc.) y lo marca ATENDIDO. */
  @Post(':id/atender')
  atender(
    @Param('id') id: string,
    @Body() dto: AtenderWebOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.webOrdersService.atender(id, dto, user.userId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Body() dto: DeleteWebOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.webOrdersService.remove(id, dto, user.userId);
  }
}
