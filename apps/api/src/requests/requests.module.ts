import { Module } from "@nestjs/common";
import { ProbeModule } from "../probe/probe.module.js";
import { RequestsController } from "./requests.controller.js";
import { RequestsService } from "./requests.service.js";

@Module({
  imports: [ProbeModule],
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
