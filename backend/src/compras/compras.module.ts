import { Module } from '@nestjs/common';
import { ComprasService } from './compras.service';
import { ComprasController } from './compras.controller';
import { AuditModule } from '../audit/audit.module';
import { InsumosModule } from '../insumos/insumos.module';
import { RecetasModule } from '../recetas/recetas.module';

@Module({
  imports: [AuditModule, InsumosModule, RecetasModule],
  controllers: [ComprasController],
  providers: [ComprasService],
})
export class ComprasModule {}
