import { Module } from "@nestjs/common";
import { UpstreamModule } from "../upstream/upstream.module.js";
import { ProbeService } from "./probe.service.js";

@Module({
  imports: [UpstreamModule],
  providers: [ProbeService],
  exports: [ProbeService],
})
export class ProbeModule {}
