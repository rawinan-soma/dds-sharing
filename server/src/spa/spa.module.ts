import { Module } from '@nestjs/common';
import { SpaController } from './spa.controller.js';

@Module({
  controllers: [SpaController],
})
export class SpaModule {}
