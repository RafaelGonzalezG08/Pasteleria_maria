import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, ROLES } from '../common/enums';
import { UsersService } from './users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  /**
   * Cambio de la propia clave. Es el unico endpoint de este controlador
   * abierto a cualquier rol: un cajero tiene que poder cambiar la suya, y
   * solo puede tocar la propia porque el usuario sale del token.
   */
  @Patch('me/password')
  @Roles(Role.ADMIN, Role.CAJERO, Role.REPOSTERO)
  changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.changePassword(user.userId, dto);
  }

  @Patch(':id/activo')
  setActive(
    @Param('id') id: string,
    @Body('activo') activo: boolean,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.usersService.setActive(id, activo, currentUser.userId);
  }

  @Patch(':id/role')
  setRole(
    @Param('id') id: string,
    @Body('role') role: Role,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    if (!ROLES.includes(role)) {
      throw new BadRequestException('Rol invalido. Usa ADMIN, CAJERO o REPOSTERO.');
    }
    return this.usersService.setRole(id, role, currentUser.userId);
  }
}
