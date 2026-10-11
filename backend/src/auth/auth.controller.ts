import { Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SetupDto } from './dto/setup.dto';
import { esConexionLocal } from '../common/network.util';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('setup-status')
  @ApiOperation({
    summary: 'Indica si la instalacion aun no tiene administrador (primer arranque).',
  })
  async setupStatus() {
    return { necesitaConfiguracion: await this.authService.necesitaConfiguracionInicial() };
  }

  @Post('setup')
  @ApiOperation({
    summary: 'Crear el administrador del primer arranque. Solo desde la propia PC y solo si no hay usuarios.',
  })
  setup(@Body() dto: SetupDto, @Req() req: Request) {
    // Endpoint sin sesion por naturaleza (aun no hay a quien loguear): se
    // limita a la propia PC para que nadie en la misma WiFi pueda reclamar
    // el administrador de una instalacion recien hecha antes que el dueño.
    if (!esConexionLocal(req)) {
      throw new ForbiddenException(
        'La configuracion inicial solo se puede hacer desde la computadora donde esta instalada la aplicacion.',
      );
    }
    return this.authService.configuracionInicial(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesion y obtener un token JWT' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('register')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Crear un nuevo usuario (solo ADMIN). Requiere sesion iniciada.',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  register(@Body() dto: RegisterDto, @CurrentUser() currentUser: AuthenticatedUser) {
    return this.authService.register(dto, currentUser.userId);
  }
}
