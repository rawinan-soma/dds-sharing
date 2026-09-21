import { Controller, Get } from '@nestjs/common';
import { DISEASE_GROUPS } from './disease-groups';
import { ProvinceLookup } from './province-lookup.service';

// What the form needs to draw its pickers. A Disease group goes out by id and
// name only: the Report codes are upstream's unit, never the Requester's (§4.1).
@Controller('reference')
export class ReferenceController {
  constructor(private readonly provinceLookup: ProvinceLookup) {}

  @Get()
  get() {
    return {
      diseaseGroups: DISEASE_GROUPS.map(({ id, name }) => ({ id, name })),
      provinces: this.provinceLookup.provinces
        .toSorted((a, b) => a.provinceId.localeCompare(b.provinceId))
        .map(({ provinceId, nameTh, healthRegion }) => ({
          provinceId,
          nameTh,
          healthRegion,
        })),
    };
  }
}
