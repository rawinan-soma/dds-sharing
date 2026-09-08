import { Module } from "@nestjs/common";
import { ProvinceIntegrityService } from "./province-integrity.service.js";

// The two pieces of reference data the service reads at boot and never
// fetches at runtime: the province lookup (verified here) and the Disease
// group classification (embedded in disease-groups.ts / report-codes.ts,
// which need no provider — they are already available the moment they are
// imported).
@Module({
  providers: [ProvinceIntegrityService],
})
export class ReferenceDataModule {}
