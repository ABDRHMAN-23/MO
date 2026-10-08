import type { IncomingMessage } from "node:http";
import type { TenantId } from "@spatial/domain";
import { ApiError, assertUuid } from "./validation";

export type Role = "owner" | "admin" | "operator" | "viewer";
export type Permission =
  | "read"
  | "manage_products"
  | "manage_spatial"
  | "manage_placements"
  | "import_inventory"
  | "manage_integrations";

const rolePermissions:Record<Role,ReadonlySet<Permission>>={
  owner:new Set(["read","manage_products","manage_spatial","manage_placements","import_inventory","manage_integrations"]),
  admin:new Set(["read","manage_products","manage_spatial","manage_placements","import_inventory","manage_integrations"]),
  operator:new Set(["read","manage_products","manage_spatial","manage_placements","import_inventory"]),
  viewer:new Set(["read"])
};

export interface AuthContext {
  tenantId:TenantId;
  role:Role;
  userId:string|null;
}

function parseRole(value:string|undefined):Role{
  if(value==="owner"||value==="admin"||value==="operator"||value==="viewer")return value;
  return "owner";
}

export function resolveAuth(_request:IncomingMessage):AuthContext{
  if(process.env.NODE_ENV==="production"){
    throw new ApiError(503,"AUTH_REQUIRED","A verified authentication adapter is required in production");
  }
  const value=process.env.DEV_TENANT_ID;
  if(!value)throw new ApiError(503,"DEV_TENANT_NOT_CONFIGURED","DEV_TENANT_ID is required outside production");
  return {
    tenantId:assertUuid(value,"DEV_TENANT_ID") as TenantId,
    role:parseRole(process.env.DEV_ROLE),
    userId:null
  };
}

export function requirePermission(auth:AuthContext,permission:Permission):void{
  if(!rolePermissions[auth.role].has(permission)){
    throw new ApiError(403,"FORBIDDEN","You do not have permission to perform this operation");
  }
}

/** @deprecated Use resolveAuth. */
export function resolveTenant(request:IncomingMessage):TenantId{
  return resolveAuth(request).tenantId;
}
