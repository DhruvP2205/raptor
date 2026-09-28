import { Module } from '@nestjs/common';
import { RubricCriteriaController } from './rubric-criteria.controller';
import { RubricCriteriaService } from './rubric-criteria.service';

@Module({
  controllers: [RubricCriteriaController],
  providers: [RubricCriteriaService],
})
export class RubricCriteriaModule {}
