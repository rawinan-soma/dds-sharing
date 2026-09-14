import { Module } from "@nestjs/common";
import { ReviewerController } from "./reviewer.controller.js";
import { AuthService } from "./auth.service.js";
import { CsrfGuard } from "./csrf.guard.js";
import { SessionGuard } from "./session.guard.js";

// APP_DB comes from the app-wide AppDbModule (@Global(), imported once in
// AppModule) — this module no longer opens its own app_role connection.
@Module({
  controllers: [ReviewerController],
  providers: [AuthService, CsrfGuard, SessionGuard],
})
export class ReviewerModule {}
