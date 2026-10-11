import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { AuditModule } from '../audit/audit.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [AuditModule, InvoicesModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
