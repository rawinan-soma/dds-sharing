import { Module } from '@nestjs/common';
import { BullBoard } from './bull-board';

@Module({
  providers: [BullBoard],
  exports: [BullBoard],
})
export class BullBoardModule {}
