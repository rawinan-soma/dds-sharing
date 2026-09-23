import { Global, Module } from '@nestjs/common';
import { CLOCK, systemClock } from './clock';

// Time, for every module that reads it: the Reviewer surface, the tick and
// /health. Global because none of them should have to import another's module
// just to learn what time it is.
@Global()
@Module({
  providers: [{ provide: CLOCK, useValue: systemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
