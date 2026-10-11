import { Module } from '@nestjs/common';
import { ProduccionService } from './produccion.service';
import { ProduccionController } from './produccion.controller';
import { AuditModule } from '../audit/audit.module';
import { InsumosModule } from '../insumos/insumos.module';
import { RecetasModule } from '../recetas/recetas.module';

@Module({
  imports: [AuditModule, InsumosModule, RecetasModule],
  controllers: [ProduccionController],
  providers: [ProduccionService],
  exports: [ProduccionService],
})
export class ProduccionModule {}
