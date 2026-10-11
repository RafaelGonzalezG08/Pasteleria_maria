import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '../common/enums';
import { SettingsService } from './settings.service';
import { UpdateBusinessProfileDto } from './dto/update-business-profile.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { MAX_UPLOAD_SIZE_BYTES } from '../common/image.util';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('business-profile')
  getProfile() {
    return this.settingsService.getProfile();
  }

  @Put('business-profile')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  updateProfile(@Body() dto: UpdateBusinessProfileDto, @CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.updateProfile(dto, user.userId);
  }

  @Post('business-profile/logo')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }))
  uploadLogo(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthenticatedUser) {
    if (!file) throw new BadRequestException('No se recibio ningun archivo.');
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('El archivo debe ser una imagen.');
    }
    return this.settingsService.updateLogo(file.buffer, file.mimetype, user.userId);
  }

  @Get('integrations-status')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  integrationsStatus() {
    return this.settingsService.getIntegrationsStatus();
  }

  /**
   * Direccion para abrir la app desde el celular (misma WiFi). La calcula
   * nativo.js al arrancar (ver obtenerIpLan) y se la pasa al backend por
   * LAN_URL; aqui solo se expone para que Configuracion no obligue al dueño
   * a correr "ipconfig". null si no se detecto ninguna red (ej. corriendo
   * "npm run start:dev" suelto, sin Electron).
   *
   * certUrl: de donde el celular descarga el certificado autofirmado (ver
   * /tls-cert.pem en main.ts) para instalarlo como CA de confianza -- sin
   * eso, Chrome nunca deja de mostrar el aviso de "conexion no privada" ni
   * ofrece "Instalar aplicacion". null si no hay certificado (sin red, o
   * corriendo suelto sin Electron).
   */
  @Get('red-local')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  redLocal() {
    const ip = process.env.LAN_IP;
    const port = process.env.PORT || '3000';
    return {
      url: process.env.LAN_URL || null,
      certUrl: ip && process.env.TLS_CERT_PATH ? `https://${ip}:${port}/tls-cert.crt` : null,
    };
  }
}
