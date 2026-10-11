import { Module } from '@nestjs/common';
import { EncargosService } from './encargos.service';
import { EncargosController } from './encargos.controller';
import { AuditModule } from '../audit/audit.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { SalesModule } from '../sales/sales.module';

@Module({
  imports: [AuditModule, InvoicesModule, SalesModule],
  controllers: [EncargosController],
  providers: [EncargosService],
  exports: [EncargosService],
})
export class EncargosModule {}
