import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { BulkProductsDto } from './dto/bulk-products.dto';
import { MermaProductoDto } from './dto/merma-producto.dto';
import { CortarPorcionesDto } from './dto/cortar-porciones.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums';
import { MAX_UPLOAD_SIZE_BYTES } from '../common/image.util';
import { generarXlsx, XLSX_CONTENT_TYPE } from '../common/xlsx.util';
import { segunRol } from '../common/costos.util';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async findAll(@Query('all') all?: string, @CurrentUser() user?: AuthenticatedUser) {
    const products = await this.productsService.findAll(all !== 'true');
    return segunRol(products, user?.role);
  }

  @Get('export')
  async exportExcel(
    @Res() res: Response,
    @Query('all') all: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const filas = await this.productsService.filasParaExportar(
      all !== 'true',
      user.role === Role.ADMIN,
    );
    const xlsx = await generarXlsx('Productos', filas);
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', 'attachment; filename="productos.xlsx"');
    res.send(xlsx);
  }

  /** Historial de mermas de producto terminado. */
  @Get('mermas')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.REPOSTERO)
  async mermas(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return segunRol(await this.productsService.mermas({ from, to }), user.role);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user?: AuthenticatedUser) {
    return segunRol(await this.productsService.findOne(id), user?.role);
  }

  @Post('bulk/baja')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  bulkDarDeBaja(@Body() dto: BulkProductsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.productsService.bulkDarDeBaja(dto.ids, user.userId);
  }

  @Post('bulk/reactivar')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  bulkReactivar(@Body() dto: BulkProductsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.productsService.bulkReactivar(dto.ids, user.userId);
  }

  @Post('bulk/eliminar')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  bulkEliminar(@Body() dto: BulkProductsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.productsService.bulkEliminar(dto.ids, user.userId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }))
  async create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const product = await this.productsService.create(dto, user.userId);
    if (!file) return product;
    this.validarImagen(file);
    return this.productsService.updatePhoto(product.id, file.buffer, file.mimetype, user.userId);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const product = await this.productsService.update(id, dto, user.userId);
    if (!file) return product;
    this.validarImagen(file);
    return this.productsService.updatePhoto(id, file.buffer, file.mimetype, user.userId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.productsService.remove(id, user.userId);
  }

  @Post(':id/photo')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }))
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No se recibio ningun archivo.');
    this.validarImagen(file);
    return this.productsService.updatePhoto(id, file.buffer, file.mimetype, user.userId);
  }

  @Delete(':id/photo')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  quitarFoto(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.productsService.quitarFoto(id, user.userId);
  }

  /** Cortar pasteles enteros en porciones (sube la existencia de esta porcion). */
  @Post(':id/cortar')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.REPOSTERO)
  async cortar(
    @Param('id') id: string,
    @Body() dto: CortarPorcionesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return segunRol(await this.productsService.cortar(id, dto.enteros, user.userId), user.role);
  }

  /** Dar de baja producto terminado que se boto (vencido, dañado...). */
  @Post(':id/merma')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.REPOSTERO, Role.CAJERO)
  async merma(
    @Param('id') id: string,
    @Body() dto: MermaProductoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return segunRol(await this.productsService.registrarMerma(id, dto, user.userId), user.role);
  }

  private validarImagen(file: Express.Multer.File) {
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('El archivo debe ser una imagen.');
    }
  }
}
