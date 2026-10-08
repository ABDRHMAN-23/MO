export type TenantId = string & { readonly __brand: "TenantId" };
export type SpatialNodeId = string & { readonly __brand: "SpatialNodeId" };
export type ProductId = string & { readonly __brand: "ProductId" };
export type PlacementId = string & { readonly __brand: "PlacementId" };

export type SpatialNodeType =
  | "space" | "floor" | "zone" | "room" | "aisle" | "rack"
  | "shelf" | "cabinet" | "drawer" | "bin" | "box" | "slot"
  | "wall" | "table" | "desk" | "counter" | "refrigerator" | "freezer" | "display_case" | "storage_area";
export type ProductStatus = "active" | "archived" | "discontinued" | "draft";
export type PlacementStatus = "placed" | "missing_location" | "stale_location" | "disputed";
export type InventorySourceStatus = "connected" | "syncing" | "delayed" | "disconnected" | "error";

export interface SpatialNode {
  id: SpatialNodeId;
  tenantId: TenantId;
  parentId: SpatialNodeId | null;
  floorId: SpatialNodeId | null;
  type: SpatialNodeType;
  name: string;
  code: string | null;
  x: number | null;
  y: number | null;
  z: number | null;
  width: number;
  height: number;
  depth: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  metadata: Record<string, unknown>;
  deletedAt: string | null;
}
export interface Product {
  id: ProductId;
  tenantId: TenantId;
  sku: string;
  barcode: string | null;
  name: string;
  category: string | null;
  imageUrl: string | null;
  status: ProductStatus;
}
export interface Placement {
  id: PlacementId;
  tenantId: TenantId;
  productId: ProductId;
  spatialNodeId: SpatialNodeId;
  status: PlacementStatus;
  verifiedAt: string | null;
  updatedAt: string;
}
export interface InventoryTruth {
  sourceId: string;
  sourceName: string;
  status: InventorySourceStatus;
  isAuthoritative: boolean;
  quantity: number | null;
  observedAt: string | null;
  externalLocationRef: string | null;
}
export interface ProductLocationResult {
  product: Product;
  placement: Placement;
  breadcrumb: SpatialNode[];
  inventory: InventoryTruth[];
}

export const SPATIAL_NODE_TYPES: SpatialNodeType[] = [
  "space","floor","zone","room","aisle","rack","shelf","cabinet","drawer","bin","box","slot",
  "wall","table","desk","counter","refrigerator","freezer","display_case","storage_area"
];

export function isPositioned(node: SpatialNode): node is SpatialNode & { x: number; y: number; z: number } {
  return node.x !== null && node.y !== null && node.z !== null;
}
export function breadcrumb(nodes: SpatialNode[], id: string): SpatialNode[] {
  const byId = new Map<string, SpatialNode>(nodes.map((node) => [node.id as string, node]));
  const result: SpatialNode[] = [];
  const visited = new Set<string>();
  let current = byId.get(id);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    result.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return result;
}
export function normalizeSearchInput(input: string): string {
  return input.normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g,"")
    .replace(/[ـ]/g,"")
    .replace(/[يى]/g,"ي")
    .replace(/[كک]/g,"ك")
    .replace(/[أإآ]/g,"ا")
    .replace(/[ؤ]/g,"و")
    .replace(/[ئ]/g,"ي")
    .toLocaleLowerCase()
    .replace(/\s+/g," ")
    .trim();
}
export function searchTokens(input: string): string[] {
  return normalizeSearchInput(input).split(/\s+/).filter(Boolean);
}
