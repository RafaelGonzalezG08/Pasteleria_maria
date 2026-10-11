import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { BulkRemoveClientsDto } from './dto/bulk-remove-clients.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums';
import { generarXlsx, XLSX_CONTENT_TYPE } from '../common/xlsx.util';

@ApiTags('clients')
@ApiBearerAuth()
@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  findAll(@Query('search') search?: string) {
    return this.clientsService.findAll(search);
  }

  @Get('export')
  async exportExcel(@Res() res: Response) {
    const filas = await this.clientsService.filasParaExportar();
    const xlsx = await generarXlsx('Clientes', filas);
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', 'attachment; filename="clientes.xlsx"');
    res.send(xlsx);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.create(dto, user.userId);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.update(id, dto, user.userId);
  }

  // Borrar un cliente es destructivo e irreversible: se restringe a ADMIN
  // (antes cualquier CAJERO podia hacerlo). El servicio ademas se niega a
  // borrar clientes que ya tienen ventas o deudas registradas.
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.remove(id, user.userId);
  }

  @Post('bulk/eliminar')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  bulkRemove(@Body() dto: BulkRemoveClientsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.bulkRemove(dto.ids, user.userId);
  }
}
