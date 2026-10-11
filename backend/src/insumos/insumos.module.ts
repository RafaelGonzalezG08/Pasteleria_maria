import { Module } from '@nestjs/common';
import { InsumosService } from './insumos.service';
import { InsumosController } from './insumos.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [InsumosController],
  providers: [InsumosService],
  exports: [InsumosService],
})
export class InsumosModule {}
