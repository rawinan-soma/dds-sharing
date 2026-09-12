import { Module } from "@nestjs/common";
import { ApiNotFoundController } from "./api-not-found.controller.js";

// Wrapped in its own module and imported last (see app.module.ts): Nest maps
// a root module's own `controllers` before it walks into any imported
// submodule, regardless of import order, so a catch-all declared directly on
// AppModule would shadow every real `/api/*` route added later — as this one
// did until every actual endpoint under `/api/reviewer` 404'd. Moving it into
// a module and importing that module last puts its route where the name
// says: a fallback, tried only once nothing else has matched.
@Module({
  controllers: [ApiNotFoundController],
})
export class ApiNotFoundModule {}
