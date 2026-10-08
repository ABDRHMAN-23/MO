import test from "node:test";
import assert from "node:assert/strict";
import { requirePermission, resolveAuth } from "../src/auth";

function request(): Request {
  return new Request("http://localhost");
}

test("viewer is read-only", () => {
  const originalNodeEnv=process.env.NODE_ENV;
  const originalTenant=process.env.DEV_TENANT_ID;
  const originalRole=process.env.DEV_ROLE;
  process.env.NODE_ENV="test";
  process.env.DEV_TENANT_ID="11111111-1111-4111-8111-111111111111";
  process.env.DEV_ROLE="viewer";
  const auth=resolveAuth(request() as unknown as import("node:http").IncomingMessage);
  assert.equal(auth.role,"viewer");
  requirePermission(auth,"read");
  assert.throws(()=>requirePermission(auth,"manage_products"),/permission/i);
  process.env.NODE_ENV=originalNodeEnv;
  process.env.DEV_TENANT_ID=originalTenant;
  process.env.DEV_ROLE=originalRole;
});

test("operator can manage core inventory but not integrations", () => {
  process.env.NODE_ENV="test";
  process.env.DEV_TENANT_ID="11111111-1111-4111-8111-111111111111";
  process.env.DEV_ROLE="operator";
  const auth=resolveAuth(request() as unknown as import("node:http").IncomingMessage);
  requirePermission(auth,"manage_products");
  requirePermission(auth,"manage_spatial");
  requirePermission(auth,"manage_placements");
  requirePermission(auth,"import_inventory");
  assert.throws(()=>requirePermission(auth,"manage_integrations"),/permission/i);
});

test("admin can manage integrations", () => {
  process.env.NODE_ENV="test";
  process.env.DEV_TENANT_ID="11111111-1111-4111-8111-111111111111";
  process.env.DEV_ROLE="admin";
  const auth=resolveAuth(request() as unknown as import("node:http").IncomingMessage);
  requirePermission(auth,"manage_integrations");
});

test("production fails closed without a verified auth adapter", () => {
  const originalNodeEnv=process.env.NODE_ENV;
  process.env.NODE_ENV="production";
  assert.throws(
    ()=>resolveAuth(request() as unknown as import("node:http").IncomingMessage),
    (error)=>Boolean(error && typeof error==="object" && "code" in error && error.code==="AUTH_REQUIRED")
  );
  process.env.NODE_ENV=originalNodeEnv;
});
