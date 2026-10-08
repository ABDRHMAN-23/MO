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


export type AiToolName =
  | "search_products"
  | "get_product_stock"
  | "get_product_locations"
  | "list_products_in_location"
  | "get_sync_status"
  | "open_3d_location"
  | "propose_product_move"
  | "propose_stock_adjustment"
  | "write_stock_adjustment"
  | "move_product"
  | "delete_product"
  | "disconnect_integration"
  | "change_billing";

export type AiToolRisk = "read" | "proposal" | "high";

export interface AiToolDefinition {
  name: AiToolName;
  risk: AiToolRisk;
  requiresConfirmation: boolean;
  description: string;
}

export const AI_TOOL_DEFINITIONS: Readonly<Record<AiToolName,AiToolDefinition>> = {
  search_products:{name:"search_products",risk:"read",requiresConfirmation:false,description:"Search tenant-scoped product candidates."},
  get_product_stock:{name:"get_product_stock",risk:"read",requiresConfirmation:false,description:"Read authoritative or cached stock truth with freshness metadata."},
  get_product_locations:{name:"get_product_locations",risk:"read",requiresConfirmation:false,description:"Read product placements and spatial hierarchy."},
  list_products_in_location:{name:"list_products_in_location",risk:"read",requiresConfirmation:false,description:"List products attached to a tenant-scoped spatial location."},
  get_sync_status:{name:"get_sync_status",risk:"read",requiresConfirmation:false,description:"Read connector health and synchronization history."},
  open_3d_location:{name:"open_3d_location",risk:"read",requiresConfirmation:false,description:"Request the client to focus an existing spatial object."},
  propose_product_move:{name:"propose_product_move",risk:"proposal",requiresConfirmation:true,description:"Prepare a product move without changing server state."},
  propose_stock_adjustment:{name:"propose_stock_adjustment",risk:"proposal",requiresConfirmation:true,description:"Prepare a stock adjustment without changing server state."},
  write_stock_adjustment:{name:"write_stock_adjustment",risk:"high",requiresConfirmation:true,description:"Write a stock adjustment after explicit user confirmation."},
  move_product:{name:"move_product",risk:"high",requiresConfirmation:true,description:"Change an existing product placement after explicit user confirmation."},
  delete_product:{name:"delete_product",risk:"high",requiresConfirmation:true,description:"Archive a product after explicit user confirmation."},
  disconnect_integration:{name:"disconnect_integration",risk:"high",requiresConfirmation:true,description:"Disconnect an integration after explicit user confirmation."},
  change_billing:{name:"change_billing",risk:"high",requiresConfirmation:true,description:"Change billing configuration after explicit user confirmation."}
};

const INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/i,
  /reveal\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|message)/i,
  /(?:show|print|give)\s+(?:me\s+)?(?:the\s+)?(?:secret|api\s*key|password|token)/i,
  /(?:run|execute)\s+(?:arbitrary\s+)?sql/i,
  /تجاهل\s+(?:كل\s+)?التعليمات/i,
  /اكشف\s+(?:الموجه|التعليمات)\s+(?:النظامية|السرية)/i,
  /أعطني\s+(?:مفتاح|كلمة\s*مرور|رمز)\s*(?:api|السر)/i
] as const;

export function detectAiPromptInjection(input:string):{detected:boolean;signals:string[]} {
  const value=input.normalize("NFKC").trim();
  const signals=INJECTION_PATTERNS.flatMap((pattern)=>pattern.test(value)?[pattern.source]:[]);
  return {detected:signals.length>0,signals};
}

export function validateAiInput(input:string,maxLength=2000):string {
  const value=input.normalize("NFKC").trim();
  if(!value) throw new Error("AI input must not be empty");
  if(value.length>maxLength) throw new Error("AI input exceeds the allowed length");
  if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) throw new Error("AI input contains disallowed control characters");
  return value;
}

export function sanitizeAiOutput(output:string,maxLength=4000):string {
  const value=output.normalize("NFKC").replace(/\u0000/g,"").trim();
  if(value.length>maxLength) return value.slice(0,maxLength);
  return value;
}

export function enforceAiTenantScope(requestTenantId:TenantId,authTenantId:TenantId):void {
  if(requestTenantId!==authTenantId) throw new Error("AI tool tenant scope violation");
}

export function assertAiTool(name:string):AiToolDefinition {
  const tool=AI_TOOL_DEFINITIONS[name as AiToolName];
  if(!tool) throw new Error("AI tool is not allow-listed");
  return tool;
}

export function requireAiConfirmation(name:string,confirmed:boolean):void {
  const tool=assertAiTool(name);
  if(tool.requiresConfirmation && !confirmed) throw new Error("Explicit confirmation is required for this AI action");
}


export { REPOSITORY_CATALOG, ACTIVE_INTEGRATION_CATALOG, SPATIAL_REFERENCE_CATALOG } from "./repository-catalog";
export type { RepositoryCatalogEntry, RepositoryRole } from "./repository-catalog";
