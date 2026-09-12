import type { Request } from "express";
import type { RequestContext } from "./auth.service.js";

export function requestContext(request: Request): RequestContext {
  return { ip: request.ip ?? "unknown", userAgent: request.headers["user-agent"] ?? "unknown" };
}
