import { Global, Module } from '@nestjs/common';
import { CLOCK, systemClock } from './clock';
import { HOLIDAYS, THAI_HOLIDAYS_SET } from './thai-holidays';

// Time and the business-hours calendar, for every module that reads them: the
// Reviewer surface, the tick and /health. Global because none of them should
// have to import another's module just to learn what time it is.
@Global()
@Module({
  providers: [
    { provide: CLOCK, useValue: systemClock },
    { provide: HOLIDAYS, useValue: THAI_HOLIDAYS_SET },
  ],
  exports: [CLOCK, HOLIDAYS],
})
export class ClockModule {}
