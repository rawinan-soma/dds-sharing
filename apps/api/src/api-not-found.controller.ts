import { All, Controller, NotFoundException, Req } from "@nestjs/common";
import type { Request } from "express";

@Controller()
export class ApiNotFoundController {
  @All(["", "*path"])
  notFound(@Req() req: Request) {
    throw new NotFoundException(`Cannot ${req.method} ${req.originalUrl}`);
  }
}
