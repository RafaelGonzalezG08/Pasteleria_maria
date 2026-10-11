import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { AuditModule } from '../audit/audit.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [AuditModule, InvoicesModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
