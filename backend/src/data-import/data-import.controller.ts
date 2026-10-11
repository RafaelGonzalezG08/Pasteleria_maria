import {
  BadRequestException,
  Controller,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DataImportService } from './data-import.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums';

// El .tar.gz de fotos de un negocio con varios cientos de piezas puede pesar
// bastante mas que una sola imagen (ver MAX_UPLOAD_SIZE_BYTES en
// image.util.ts, pensado para UNA foto). Esto es una transferencia manual
// entre las propias computadoras del negocio, no una subida publica, asi que
// el techo puede ser generoso.
const MAX_IMPORT_SIZE_BYTES = 300 * 1024 * 1024;

@ApiTags('data-import')
@ApiBearerAuth()
@Controller('data-import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class DataImportController {
  constructor(private readonly dataImport: DataImportService) {}

  @Post('productos')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 },
        { name: 'fotos', maxCount: 1 },
      ],
      { limits: { fileSize: MAX_IMPORT_SIZE_BYTES } },
    ),
  )
  importarProductos(
    @UploadedFiles() files: { file?: Express.Multer.File[]; fotos?: Express.Multer.File[] },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const file = files?.file?.[0];
    if (!file) throw new BadRequestException('No se recibio ningun archivo.');
    return this.dataImport.importarProductos(file.buffer, files?.fotos?.[0]?.buffer, user.userId);
  }
}
