import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { EstadoDeuda, Role } from '../common/enums';
import { esConexionLocal } from '../common/network.util';
import { ClientDebtsService } from './client-debts.service';
import { RegisterPaymentDto } from './dto/register-payment.dto';
import { DeletePaymentDto } from './dto/delete-payment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('client-debts')
@ApiBearerAuth()
@Controller('client-debts')
@UseGuards(JwtAuthGuard)
export class ClientDebtsController {
  constructor(private readonly debtsService: ClientDebtsService) {}

  @Get()
  findAll(@Query('status') status?: EstadoDeuda) {
    return this.debtsService.findAll(status);
  }

  @Post(':id/payments')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.CONTABILIDAD)
  registerPayment(
    @Param('id') id: string,
    @Body() dto: RegisterPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.debtsService.registerPayment(id, dto, user.userId);
  }

  @Delete('payments/:paymentId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.CONTABILIDAD)
  removePayment(
    @Param('paymentId') paymentId: string,
    @Body() dto: DeletePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.debtsService.removePayment(paymentId, dto, user.userId);
  }

  @Post(':id/remind')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.CONTABILIDAD)
  sendReminder(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.debtsService.sendReminder(id, user.userId, esConexionLocal(req));
  }
}
