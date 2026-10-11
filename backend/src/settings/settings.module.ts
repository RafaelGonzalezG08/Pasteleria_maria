import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { AuditModule } from '../audit/audit.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [AuditModule, InvoicesModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
