import type { InventoryTruth, Placement, Product, ProductLocationResult, SpatialNode } from "@spatial/domain";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export class ApiClientError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers
    }
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error;
    throw new ApiClientError(
      typeof error?.code === "string" ? error.code : "REQUEST_FAILED",
      typeof error?.message === "string" ? error.message : "Request failed",
      response.status
    );
  }
  return payload as T;
}

export interface Overview {
  products: number;
  spatial_nodes: number;
  placements: number;
  inventory_sources: number;
  last_activity: string | null;
}

export interface InventorySourceSummary {
  id: string;
  provider_type: string;
  name: string;
  location_ref: string | null;
  status: string;
  is_authoritative: boolean;
  last_synced_at: string | null;
}

export const api = {
  overview: () => request<Overview>("/api/overview"),
  spatial: (query = "") => request<SpatialNode[]>(`/api/spatial${query ? `?q=${encodeURIComponent(query)}` : ""}`),
  spatialById: (id: string) => request<SpatialNode>(`/api/spatial/${id}`),
  products: (query = "") => request<Product[]>(`/api/products${query ? `?q=${encodeURIComponent(query)}` : ""}`),
  productLocations: (id: string) => request<ProductLocationResult[]>(`/api/products/${id}/locations`),
  inventorySources: () => request<InventorySourceSummary[]>("/api/inventory-sources"),
  createSpatial: (input: Partial<SpatialNode> & { parentId?: string | null }) =>
    request<SpatialNode>("/api/spatial", {method:"POST",body:JSON.stringify(input)}),
  updateSpatial: (id: string, input: Partial<SpatialNode>) =>
    request<SpatialNode>(`/api/spatial/${id}`, {method:"PATCH",body:JSON.stringify(input)}),
  createProduct: (input: {sku:string;name:string;barcode?:string;category?:string;imageUrl?:string}) =>
    request<Product>("/api/products", {method:"POST",body:JSON.stringify(input)}),
  createSource: (input: {providerType:string;name:string;locationRef?:string;isAuthoritative?:boolean}) =>
    request<InventorySourceSummary>("/api/inventory-sources", {method:"POST",body:JSON.stringify(input)}),
  createPlacement: (input: {productId:string;spatialNodeId:string;reason?:string}) =>
    request<Placement>("/api/placements", {method:"POST",body:JSON.stringify(input)}),
  importProducts: (input: {rows:Record<string,unknown>[];sourceId?:string}) =>
    request<{rows:number;created:number;updated:number}>("/api/import/products", {method:"POST",body:JSON.stringify(input)})
};

export function latestVerifiedQuantity(items: InventoryTruth[]): number | null {
  const verified = items.filter((item) => item.quantity !== null && item.status === "connected");
  return verified.length ? verified[0].quantity : null;
}
