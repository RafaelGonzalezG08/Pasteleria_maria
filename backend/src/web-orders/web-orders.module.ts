import { Module } from '@nestjs/common';
import { WebOrdersController } from './web-orders.controller';
import { WebOrdersService } from './web-orders.service';
import { WebOrdersRelayService } from './web-orders-relay.service';
import { WebSalesRelayService } from './web-sales-relay.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { SalesModule } from '../sales/sales.module';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [PrismaModule, AuditModule, SalesModule, ClientsModule],
  controllers: [WebOrdersController],
  providers: [WebOrdersService, WebOrdersRelayService, WebSalesRelayService],
})
export class WebOrdersModule {}
