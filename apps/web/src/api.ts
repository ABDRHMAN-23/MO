import type { InventoryTruth, Placement, Product, ProductLocationResult, SpatialNode } from "@spatial/domain";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/,"") ?? "";

export class ApiClientError extends Error {
  constructor(public readonly code:string,message:string,public readonly status:number){
    super(message);
    this.name="ApiClientError";
  }
}

async function request<T>(path:string,init?:RequestInit):Promise<T>{
  const response=await fetch(`${API_BASE}${path}`,{
    ...init,
    headers:{
      accept:"application/json",
      ...(init?.body?{"content-type":"application/json"}:{}),
      ...init?.headers
    }
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok){
    const error=payload?.error;
    throw new ApiClientError(
      typeof error?.code==="string"?error.code:"REQUEST_FAILED",
      typeof error?.message==="string"?error.message:"Request failed",
      response.status
    );
  }
  return payload as T;
}

interface ApiSpatialNode{
  id:string;parent_id:string|null;floor_id:string|null;type:SpatialNode["type"];name:string;code:string|null;
  x:number|null;y:number|null;z:number|null;width:number;height:number;depth:number;
  rotation_x:number;rotation_y:number;rotation_z:number;metadata:Record<string,unknown>;deleted_at:string|null;
}
interface ApiProduct{
  id:string;sku:string;barcode:string|null;name:string;category:string|null;image_url:string|null;status:Product["status"];
}
interface ApiPlacement{
  id:string;product_id:string;spatial_node_id:string;status:Placement["status"];verified_at:string|null;updated_at:string;
}

function mapSpatialNode(n:ApiSpatialNode):SpatialNode{
  return {
    id:n.id as SpatialNode["id"],
    tenantId:"" as SpatialNode["tenantId"],
    parentId:n.parent_id as SpatialNode["id"]|null,
    floorId:n.floor_id as SpatialNode["id"]|null,
    type:n.type,name:n.name,code:n.code,x:n.x,y:n.y,z:n.z,width:n.width,height:n.height,depth:n.depth,
    rotationX:n.rotation_x,rotationY:n.rotation_y,rotationZ:n.rotation_z,metadata:n.metadata??{},deletedAt:n.deleted_at
  };
}
function mapProduct(p:ApiProduct):Product{
  return {
    id:p.id as Product["id"],tenantId:"" as Product["tenantId"],sku:p.sku,barcode:p.barcode,name:p.name,
    category:p.category,imageUrl:p.image_url,status:p.status
  };
}
function mapPlacement(p:ApiPlacement):Placement{
  return {
    id:p.id as Placement["id"],tenantId:"" as Placement["tenantId"],productId:p.product_id as Product["id"],
    spatialNodeId:p.spatial_node_id as SpatialNode["id"],status:p.status,verifiedAt:p.verified_at,updatedAt:p.updated_at
  };
}

export interface Overview{
  products:number;
  spatial_nodes:number;
  placements:number;
  inventory_sources:number;
  last_activity:string|null;
}
export interface InventorySourceSummary{
  id:string;
  provider_type:string;
  name:string;
  location_ref:string|null;
  status:string;
  is_authoritative:boolean;
  last_synced_at:string|null;
}
export interface IntegrationSummary{
  id:string;
  provider_type:"odoo"|string;
  name:string;
  base_url:string;
  provider_database:string|null;
  enabled:boolean;
  last_healthcheck_at:string|null;
  last_error:string|null;
  source_id:string|null;
  source_status:string|null;
  is_authoritative:boolean|null;
  last_synced_at:string|null;
  latest_sync_status:string|null;
  latest_sync_started_at:string|null;
  latest_sync_finished_at:string|null;
  latest_sync_products_seen:number|null;
  latest_sync_stock_rows:number|null;
  latest_sync_error:string|null;
}
export interface IntegrationSyncRun{
  id:string;
  status:"pending"|"running"|"succeeded"|"failed";
  attempt:number;
  triggered_by:string;
  started_at:string;
  finished_at:string|null;
  products_seen:number;
  products_created:number;
  products_updated:number;
  locations_seen:number;
  locations_upserted:number;
  stock_rows:number;
  stock_skipped:number;
  error_code:string|null;
  error_message:string|null;
  created_at:string;
}
export interface IntegrationLocationSummary{
  id:string;
  external_location_id:string;
  parent_external_location_id:string|null;
  name:string;
  complete_name:string|null;
  usage:string|null;
  active:boolean;
  synced_at:string;
}

export const api={
  overview:()=>request<Overview>("/api/overview"),
  spatial:async(query="")=>(await request<ApiSpatialNode[]>(`/api/spatial${query?`?q=${encodeURIComponent(query)}`:""}`)).map(mapSpatialNode),
  spatialById:async(id:string)=>mapSpatialNode(await request<ApiSpatialNode>(`/api/spatial/${id}`)),
  spatialProducts:async(id:string)=>(await request<ApiProduct[]>(`/api/spatial/${id}/products`)).map(mapProduct),
  products:async(query="")=>(await request<ApiProduct[]>(`/api/products${query?`?q=${encodeURIComponent(query)}`:""}`)).map(mapProduct),
  productLocations:async(id:string)=>{
    const rows=await request<Array<{product:ApiProduct;placement:ApiPlacement;breadcrumb:ApiSpatialNode[];inventory:InventoryTruth[]}>>(`/api/products/${id}/locations`);
    return rows.map((row):ProductLocationResult=>({
      product:mapProduct(row.product),
      placement:mapPlacement(row.placement),
      breadcrumb:row.breadcrumb.map(mapSpatialNode),
      inventory:row.inventory
    }));
  },
  inventorySources:()=>request<InventorySourceSummary[]>("/api/inventory-sources"),
  integrations:()=>request<IntegrationSummary[]>("/api/integrations"),
  integrationLocations:(connectionId:string)=>request<IntegrationLocationSummary[]>(`/api/integrations/${connectionId}/locations`),
  integrationSyncRuns:(connectionId:string)=>request<IntegrationSyncRun[]>(`/api/integrations/${connectionId}/sync-runs`),
  createOdoo:(input:{name:string;baseUrl:string;database?:string;apiKey:string})=>
    request<IntegrationSummary>("/api/integrations/odoo",{method:"POST",body:JSON.stringify(input)}),
  healthOdoo:(connectionId:string)=>
    request<{status:"connected"|"syncing"|"delayed"|"disconnected"|"error";checkedAt:string;message?:string}>(`/api/integrations/odoo/${connectionId}/health`,{method:"POST"}),
  movePlacement:(id:string,input:{spatialNodeId:string;expectedUpdatedAt:string;reason?:string})=>
    request<ApiPlacement>(`/api/placements/${id}`,{method:"PATCH",body:JSON.stringify(input)}).then(mapPlacement),
  syncOdoo:(connectionId:string)=>
    request<{products:number;productsCreated:number;productsUpdated:number;locationsUpserted:number;stockRows:number;stockSkipped:number}>(`/api/integrations/odoo/${connectionId}/sync`,{method:"POST"}),
  mapIntegrationLocation:(input:{sourceId:string;spatialNodeId:string;externalLocationRef:string})=>
    request<{id:string;source_id:string;spatial_node_id:string;external_location_ref:string}>(
      "/api/inventory-location-mappings",
      {method:"POST",body:JSON.stringify(input)}
    ),
  createSpatial:(input:Record<string,unknown>)=>
    request<ApiSpatialNode>("/api/spatial",{method:"POST",body:JSON.stringify(input)}).then(mapSpatialNode),
  updateSpatial:(id:string,input:Record<string,unknown>)=>
    request<ApiSpatialNode>(`/api/spatial/${id}`,{method:"PATCH",body:JSON.stringify(input)}).then(mapSpatialNode),
  createProduct:(input:{sku:string;name:string;barcode?:string;category?:string;imageUrl?:string})=>
    request<ApiProduct>("/api/products",{method:"POST",body:JSON.stringify(input)}).then(mapProduct),
  createSource:(input:{providerType:string;name:string;locationRef?:string;isAuthoritative?:boolean})=>
    request<InventorySourceSummary>("/api/inventory-sources",{method:"POST",body:JSON.stringify(input)}),
  createPlacement:(input:{productId:string;spatialNodeId:string;reason?:string})=>
    request<ApiPlacement>("/api/placements",{method:"POST",body:JSON.stringify(input)}).then(mapPlacement),
  importProducts:(input:{rows:Record<string,unknown>[];sourceId?:string})=>
    request<{rows:number;created:number;updated:number}>("/api/import/products",{method:"POST",body:JSON.stringify(input)})
};

export function latestVerifiedQuantity(items:InventoryTruth[]):number|null{
  const authoritative=items.filter((item)=>item.isAuthoritative&&item.status==="connected"&&item.quantity!==null);
  if(!authoritative.length)return null;
  const quantities=new Set(authoritative.map((item)=>item.quantity));
  return quantities.size===1 ? authoritative[0].quantity : null;
}
