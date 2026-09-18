import { Module, OnModuleInit } from '@nestjs/common';
import { DISEASE_GROUPS, assertDiseaseGroupsPartition } from './disease-groups';
import { ProvinceLookup } from './province-lookup.service';

@Module({
  providers: [ProvinceLookup],
  exports: [ProvinceLookup],
})
export class ReferenceDataModule implements OnModuleInit {
  onModuleInit() {
    // The embedded classification is read at boot, never fetched.
    assertDiseaseGroupsPartition(DISEASE_GROUPS);
  }
}
