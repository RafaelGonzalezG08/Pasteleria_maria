import { Module } from '@nestjs/common';
import { DataImportService } from './data-import.service';
import { DataImportController } from './data-import.controller';
import { AuditModule } from '../audit/audit.module';
import { ProductsModule } from '../products/products.module';
import { CatalogoModule } from '../catalogo/catalogo.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [AuditModule, ProductsModule, CatalogoModule, InvoicesModule],
  controllers: [DataImportController],
  providers: [DataImportService],
})
export class DataImportModule {}
