import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ClientsModule } from './clients/clients.module';
import { ClientDebtsModule } from './client-debts/client-debts.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { SalesModule } from './sales/sales.module';
import { OrdersModule } from './orders/orders.module';
import { WebOrdersModule } from './web-orders/web-orders.module';
import { CatalogoModule } from './catalogo/catalogo.module';
import { InvoicesModule } from './invoices/invoices.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { BackupsModule } from './backups/backups.module';
import { DataImportModule } from './data-import/data-import.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    ClientDebtsModule,
    ProductsModule,
    CategoriesModule,
    SalesModule,
    OrdersModule,
    WebOrdersModule,
    CatalogoModule,
    InvoicesModule,
    ExpensesModule,
    ReportsModule,
    SettingsModule,
    BackupsModule,
    DataImportModule,
    HealthModule,
  ],
})
export class AppModule {}
