export type TenantId = string & { readonly __brand: "TenantId" };
export type SpaceId = string & { readonly __brand: "SpaceId" };
export type ProductId = string & { readonly __brand: "ProductId" };
export type PlacementId = string & { readonly __brand: "PlacementId" };

export type SpatialNodeType = "space" | "floor" | "zone" | "rack" | "shelf" | "bin";

export interface SpatialNode {
  id: string;
  tenantId: TenantId;
  parentId: string | null;
  type: SpatialNodeType;
  name: string;
  sortOrder: number;
}

export interface Product {
  id: ProductId;
  tenantId: TenantId;
  sku: string;
  name: string;
  barcode?: string;
}

export interface Placement {
  id: PlacementId;
  tenantId: TenantId;
  productId: ProductId;
  spatialNodeId: string;
  quantity: number | null;
  quantitySource: "inventory" | "unknown";
}

export function breadcrumb(nodes: SpatialNode[], id: string): SpatialNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const result: SpatialNode[] = [];
  let current = byId.get(id);
  while (current) {
    result.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return result;
}
