import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { MigrationsService } from './migrations.service';
import { BootstrapService } from './bootstrap.service';

@Global()
@Module({
  providers: [PrismaService, MigrationsService, BootstrapService],
  exports: [PrismaService, MigrationsService, BootstrapService],
})
export class PrismaModule {}
