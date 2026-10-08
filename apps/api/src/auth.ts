import type { IncomingMessage } from "node:http";
import type { TenantId } from "@spatial/domain";
import { ApiError, assertUuid } from "./validation";

export function resolveTenant(_request: IncomingMessage): TenantId {
  if (process.env.NODE_ENV === "production") {
    throw new ApiError(503,"AUTH_REQUIRED","A verified authentication adapter is required in production");
  }
  const value=process.env.DEV_TENANT_ID;
  if (!value) throw new ApiError(503,"DEV_TENANT_NOT_CONFIGURED","DEV_TENANT_ID is required outside production");
  return assertUuid(value,"DEV_TENANT_ID") as TenantId;
}
