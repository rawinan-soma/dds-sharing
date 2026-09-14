import { Module } from "@nestjs/common";
import { ApiNotFoundController } from "./api-not-found.controller.js";

// A module of its own, imported last in AppModule (not declared as one of
// AppModule's own controllers): Nest registers a module's own controllers
// before its imports are scanned, so a catch-all declared directly on the
// root module binds ahead of every feature module's routes and swallows
// them. Importing it last instead makes every real /api/* route get first
// refusal, and this stays the true 404 for whatever is left.
@Module({
  controllers: [ApiNotFoundController],
})
export class ApiNotFoundModule {}
