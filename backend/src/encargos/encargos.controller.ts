import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EncargosService } from './encargos.service';
import {
  CambiarEstadoDto,
  CancelarEncargoDto,
  CreateEncargoDto,
  EntregarEncargoDto,
  PagoEncargoDto,
  UpdateEncargoDto,
} from './dto/encargo.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums';
import { MAX_UPLOAD_SIZE_BYTES } from '../common/image.util';

/**
 * Encargos de clientes. Todos los roles los ven (el repostero necesita saber
 * que hacer); crear, cobrar y entregar es de caja; el repostero solo mueve
 * el estado (en produccion / listo).
 */
@ApiTags('encargos')
@ApiBearerAuth()
@Controller('encargos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.CAJERO)
export class EncargosController {
  constructor(private readonly encargos: EncargosService) {}

  @Get()
  @Roles(Role.ADMIN, Role.CAJERO, Role.REPOSTERO)
  findAll(
    @Query('estado') estado?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('clientId') clientId?: string,
    @Query('q') q?: string,
  ) {
    return this.encargos.findAll({ estado, from, to, clientId, q });
  }

  @Get('resumen')
  @Roles(Role.ADMIN, Role.CAJERO, Role.REPOSTERO)
  resumen() {
    return this.encargos.resumen();
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.CAJERO, Role.REPOSTERO)
  findOne(@Param('id') id: string) {
    return this.encargos.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateEncargoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.encargos.create(dto, user.userId);
  }

  @Post('foto-referencia')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }))
  subirFoto(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibio ningun archivo.');
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('El archivo debe ser una imagen.');
    }
    return this.encargos.subirFotoReferencia(file.buffer, file.mimetype);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEncargoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.encargos.update(id, dto, user.userId);
  }

  @Patch(':id/estado')
  @Roles(Role.ADMIN, Role.CAJERO, Role.REPOSTERO)
  cambiarEstado(
    @Param('id') id: string,
    @Body() dto: CambiarEstadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.encargos.cambiarEstado(id, dto, user.userId);
  }

  @Post(':id/pagos')
  registrarPago(
    @Param('id') id: string,
    @Body() dto: PagoEncargoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.encargos.registrarPago(id, dto, user.userId);
  }

  @Delete('pagos/:pagoId')
  @Roles(Role.ADMIN)
  eliminarPago(@Param('pagoId') pagoId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.encargos.eliminarPago(pagoId, user.userId);
  }

  @Post(':id/entregar')
  entregar(
    @Param('id') id: string,
    @Body() dto: EntregarEncargoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.encargos.entregar(id, dto, user.userId);
  }

  @Post(':id/cancelar')
  cancelar(
    @Param('id') id: string,
    @Body() dto: CancelarEncargoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.encargos.cancelar(id, dto, user.userId);
  }
}
