import { Module } from '@nestjs/common';
import { ClientDebtsService } from './client-debts.service';
import { ClientDebtsController } from './client-debts.controller';
import { AuditModule } from '../audit/audit.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [AuditModule, InvoicesModule],
  controllers: [ClientDebtsController],
  providers: [ClientDebtsService],
  exports: [ClientDebtsService],
})
export class ClientDebtsModule {}
