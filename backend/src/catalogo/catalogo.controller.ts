import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CatalogoService } from './catalogo.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums';

@ApiTags('catalogo')
@ApiBearerAuth()
@Controller('catalogo')
@UseGuards(JwtAuthGuard, RolesGuard)
// Publicar el catalogo expone precios del negocio a internet: es decision
// del dueño, no de quien atiende la caja.
@Roles(Role.ADMIN)
export class CatalogoController {
  constructor(private readonly catalogoService: CatalogoService) {}

  @Post('generar')
  generar() {
    // Boton manual: siempre re-publica en Netlify (aunque el contenido no
    // haya cambiado), por si el dueno quiere forzar el despliegue.
    return this.catalogoService.generar(true);
  }
}
