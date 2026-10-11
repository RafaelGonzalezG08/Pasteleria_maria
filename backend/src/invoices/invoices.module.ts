import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { RenderService } from './render.service';
import { StorageService } from './storage.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappQueueService } from './whatsapp-queue.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    RenderService,
    StorageService,
    WhatsappService,
    WhatsappQueueService,
  ],
  exports: [InvoicesService, StorageService],
})
export class InvoicesModule {}
