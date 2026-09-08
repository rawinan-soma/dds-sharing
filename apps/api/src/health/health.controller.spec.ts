import { describe, it, expect, beforeEach } from "vitest";
import { Test } from "@nestjs/testing";
import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it("names all four components", () => {
    const document = controller.check();

    expect(Object.keys(document.components).sort()).toEqual(
      ["disk", "extraction", "mail", "scheduler"].sort(),
    );
  });

  it("returns the same document from the scheduler alias", () => {
    expect(controller.checkSchedulerAlias()).toEqual(controller.check());
  });
});
