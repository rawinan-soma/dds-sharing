import { Module } from "@nestjs/common";
import { ReviewerController } from "./reviewer.controller.js";
import { AuthService } from "./auth.service.js";
import { CsrfGuard } from "./csrf.guard.js";
import { SessionGuard } from "./session.guard.js";
import { appDbProvider } from "./app-db.provider.js";

@Module({
  controllers: [ReviewerController],
  providers: [appDbProvider, AuthService, CsrfGuard, SessionGuard],
})
export class ReviewerModule {}
