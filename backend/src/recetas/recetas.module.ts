import { Module } from '@nestjs/common';
import { RecetasService } from './recetas.service';
import { RecetasController } from './recetas.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [RecetasController],
  providers: [RecetasService],
  exports: [RecetasService],
})
export class RecetasModule {}
