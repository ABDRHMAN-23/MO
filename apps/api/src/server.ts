import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import {
  breadcrumb,
  normalizeSearchInput,
  SPATIAL_NODE_TYPES,
  type SpatialNodeType,
  type TenantId
} from "@spatial/domain";
import { resolveTenant } from "./auth";
import { decryptSecret, encryptSecret } from "./integration-crypto";
import { healthcheck, withTenant } from "./db";
import {
  ApiError, assertUuid, bodyRows, finiteNumber, integer, optionalText, requestId, safeMetadata, text
} from "./validation";
import { RateLimiter } from "./rate-limit";
import { assertSafeOutboundUrl, OdooConnector } from "@spatial/integrations";

const port = Number(process.env.PORT ?? 8787);
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
const limiter = new RateLimiter(120, 60_000);
const MAX_BODY = 1_000_000;

function sendJson(res: ServerResponse, status: number, data: unknown, extra: Record<string,string> = {}) {
  res.statusCode = status;
  res.setHeader("content-type","application/json; charset=utf-8");
  res.setHeader("cache-control","no-store");
  for (const [key,value] of Object.entries(extra)) res.setHeader(key,value);
  res.end(JSON.stringify(data));
}

function securityHeaders(res: ServerResponse) {
  res.setHeader("x-content-type-options","nosniff");
  res.setHeader("x-frame-options","DENY");
  res.setHeader("referrer-policy","strict-origin-when-cross-origin");
  res.setHeader("permissions-policy","camera=(self), microphone=()");
  res.setHeader("cross-origin-opener-policy","same-origin");
  res.setHeader("cross-origin-resource-policy","same-origin");
  if (process.env.NODE_ENV==="production") {
    res.setHeader("strict-transport-security","max-age=31536000; includeSubDomains");
  }
}

function applyCors(req:IncomingMessage,res:ServerResponse):boolean {
  const origin=req.headers.origin;
  if (!origin) return true;
  if (origin!==webOrigin) {
    sendJson(res,403,{error:{code:"CORS_DENIED",message:"Origin is not allowed"}});
    return false;
  }
  res.setHeader("access-control-allow-origin",origin);
  res.setHeader("vary","Origin");
  res.setHeader("access-control-allow-methods","GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers","content-type");
  res.setHeader("access-control-max-age","600");
  return true;
}

function clientKey(req:IncomingMessage):string {
  const forwarded=req.headers["x-forwarded-for"];
  const value=typeof forwarded==="string" ? forwarded.split(",")[0].trim() : req.socket.remoteAddress ?? "unknown";
  return value.slice(0,120);
}

async function readJson(req:IncomingMessage):Promise<Record<string,unknown>> {
  return new Promise((resolve,reject)=>{
    let size=0; let aborted=false; const chunks:Buffer[]=[];
    req.on("data",(chunk:Buffer)=>{
      if (aborted) return;
      size+=chunk.length;
      if (size>MAX_BODY) {
        aborted=true;
        reject(new ApiError(413,"BODY_TOO_LARGE","Request body exceeds 1 MB"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end",()=>{
      if (aborted) return;
      try {
        const raw=Buffer.concat(chunks).toString("utf8");
        const parsed=raw ? JSON.parse(raw) : {};
        if (!parsed || typeof parsed!=="object" || Array.isArray(parsed)) {
          reject(new ApiError(400,"INVALID_JSON","JSON body must be an object"));
          return;
        }
        resolve(parsed as Record<string,unknown>);
      } catch {
        reject(new ApiError(400,"INVALID_JSON","Malformed JSON"));
      }
    });
    req.on("error",reject);
  });
}

function likePattern(value:string):string {
  return `%${value.replace(/[%_\\\\]/g,"\\\\$&")}%`;
}

function dbError(error:unknown):ApiError|null {
  const code=typeof error==="object" && error && "code" in error ? String((error as {code?:unknown}).code) : "";
  if (code==="23505") return new ApiError(409,"CONFLICT","A record with the same unique identifier already exists");
  if (code==="23503") return new ApiError(409,"INVALID_REFERENCE","A referenced record does not exist or belongs to another tenant");
  if (code==="23514") return new ApiError(400,"INVALID_INPUT","A database constraint rejected the value");
  if (code==="42501") return new ApiError(403,"FORBIDDEN","The database rejected this operation");
  return null;
}

async function listSpatial(tenantId:TenantId,search:string|null) {
  return withTenant(tenantId,async(db)=>{
    const query=search?.trim() ? likePattern(normalizeSearchInput(search)) : null;
    const result=query
      ? await db.query({text:"select id,parent_id,floor_id,node_type as type,name,code,x,y,z,width,height,depth,rotation_x,rotation_y,rotation_z,metadata,deleted_at from spatial_nodes where deleted_at is null and search_text_normalized ilike '%' || app.normalize_search_text($1) || '%' order by sort_order,name",values:[query]})
      : await db.query("select id,parent_id,floor_id,node_type as type,name,code,x,y,z,width,height,depth,rotation_x,rotation_y,rotation_z,metadata,deleted_at from spatial_nodes where deleted_at is null order by sort_order,name");
    return result.rows;
  });
}

async function getSpatial(tenantId:TenantId,id:string) {
  assertUuid(id,"id");
  return withTenant(tenantId,async(db)=>{
    const result=await db.query({text:"select id,parent_id,floor_id,node_type as type,name,code,x,y,z,width,height,depth,rotation_x,rotation_y,rotation_z,metadata,deleted_at from spatial_nodes where id=$1 and deleted_at is null",values:[id]});
    if (!result.rows[0]) throw new ApiError(404,"NOT_FOUND","Spatial node not found");
    return result.rows[0];
  });
}

async function spatialProducts(tenantId:TenantId,nodeId:string) {
  assertUuid(nodeId,"nodeId");
  return withTenant(tenantId,async(db)=>{
    const result=await db.query({
      text:"select p.id,p.sku,p.barcode,p.name,p.category,p.image_url,p.status from placements pl join products p on p.id=pl.product_id where pl.spatial_node_id=$1 and pl.deleted_at is null and p.status <> 'archived' order by p.name",
      values:[nodeId]
    });
    return result.rows;
  });
}

async function createSpatial(tenantId:TenantId,body:Record<string,unknown>) {
  const name=text(body.name,"name");
  const type=text(body.type,"type",20) as SpatialNodeType;
  if (!SPATIAL_NODE_TYPES.includes(type)) throw new ApiError(400,"INVALID_INPUT","Unsupported spatial node type");
  const code=optionalText(body.code,"code",80);
  const parentId=body.parentId==null ? null : assertUuid(body.parentId,"parentId");
  const x=finiteNumber(body.x,"x"), y=finiteNumber(body.y,"y"), z=finiteNumber(body.z,"z");
  const width=finiteNumber(body.width ?? 1,"width",0.01,10_000) ?? 1;
  const height=finiteNumber(body.height ?? 1,"height",0.01,10_000) ?? 1;
  const depth=finiteNumber(body.depth ?? 1,"depth",0.01,10_000) ?? 1;
  const rotationX=finiteNumber(body.rotationX ?? 0,"rotationX") ?? 0;
  const rotationY=finiteNumber(body.rotationY ?? 0,"rotationY") ?? 0;
  const rotationZ=finiteNumber(body.rotationZ ?? 0,"rotationZ") ?? 0;
  const metadata=safeMetadata(body.metadata);

  return withTenant(tenantId,async(db)=>{
    let floorId:string|null=null;
    if (parentId) {
      const parent=await db.query({text:"select id,floor_id,node_type from spatial_nodes where id=$1 and deleted_at is null",values:[parentId]});
      if (!parent.rows[0]) throw new ApiError(400,"INVALID_PARENT","Parent location not found");
      floorId=parent.rows[0].node_type==="floor" ? parent.rows[0].id : parent.rows[0].floor_id;
    }
    const inserted=await db.query({
      text:"insert into spatial_nodes (tenant_id,parent_id,node_type,name,code,x,y,z,width,height,depth,rotation_x,rotation_y,rotation_z,metadata,search_text_normalized) values (current_setting('app.tenant_id')::uuid,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,app.normalize_search_text($3 || ' ' || coalesce($4,''))) returning id",
      values:[parentId,type,name,code,x,y,z,width,height,depth,rotationX,rotationY,rotationZ,JSON.stringify(metadata)]
    });
    const id=inserted.rows[0].id as string;
    const finalRow=(await db.query({
      text:"update spatial_nodes set floor_id=$1,updated_at=now() where id=$2 returning id,parent_id,floor_id,node_type as type,name,code,x,y,z,width,height,depth,rotation_x,rotation_y,rotation_z,metadata,deleted_at",
      values:[type==="floor" ? id : floorId,id]
    })).rows[0];
    await db.query({
      text:"insert into audit_events (tenant_id,action,entity_type,entity_id,new_data,metadata) values (current_setting('app.tenant_id')::uuid,'create','spatial_node',$1,$2::jsonb,'{\"source\":\"api\"}')",
      values:[id,JSON.stringify(finalRow)]
    });
    return finalRow;
  });
}

async function updateSpatial(tenantId:TenantId,id:string,body:Record<string,unknown>) {
  assertUuid(id,"id");
  const columnMap:Record<string,string>={name:"name",code:"code",width:"width",height:"height",depth:"depth",x:"x",y:"y",z:"z",rotationX:"rotation_x",rotationY:"rotation_y",rotationZ:"rotation_z",metadata:"metadata"};
  const patch:Record<string,unknown>={};
  if (body.name!==undefined) patch.name=text(body.name,"name");
  if (body.code!==undefined) patch.code=optionalText(body.code,"code",80);
  for (const key of ["width","height","depth"] as const) if (body[key]!==undefined) patch[key]=finiteNumber(body[key],key,0.01,10_000);
  for (const key of ["x","y","z","rotationX","rotationY","rotationZ"] as const) if (body[key]!==undefined) patch[key]=finiteNumber(body[key],key);
  if (body.metadata!==undefined) patch.metadata=safeMetadata(body.metadata);
  if (!Object.keys(patch).length) throw new ApiError(400,"INVALID_INPUT","No supported fields supplied");
  const values:unknown[]=[];
  const assignments=Object.entries(patch).map(([key,value],i)=>{
    values.push(key==="metadata" ? JSON.stringify(value) : value);
    return `${columnMap[key]}=${i+1}${key==="metadata" ? "::jsonb":""}`;
  });
  return withTenant(tenantId,async(db)=>{
    const before=await db.query({text:"select * from spatial_nodes where id=$1 and deleted_at is null for update",values:[id]});
    if (!before.rows[0]) throw new ApiError(404,"NOT_FOUND","Spatial node not found");
    const oldRow=before.rows[0];

    if (patch.name !== undefined || patch.code !== undefined) {
      const searchSource=`${patch.name ?? String(oldRow.name)} ${patch.code ?? (oldRow.code ?? "")}`;
      values.push(searchSource);
      assignments.push(`search_text_normalized=app.normalize_search_text(${values.length})`);
    }

    values.push(id);
    const updated=await db.query({
      text:`update spatial_nodes set ${assignments.join(",")},updated_at=now() where id=${values.length} and deleted_at is null returning id,parent_id,floor_id,node_type as type,name,code,x,y,z,width,height,depth,rotation_x,rotation_y,rotation_z,metadata,deleted_at`,
      values
    });
    await db.query({
      text:"insert into audit_events (tenant_id,action,entity_type,entity_id,old_data,new_data,metadata) values (current_setting('app.tenant_id')::uuid,'update','spatial_node',$1,$2::jsonb,$3::jsonb,'{\"source\":\"api\"}')",
      values:[id,JSON.stringify(before.rows[0]),JSON.stringify(updated.rows[0])]
    });
    return updated.rows[0];
  });
}

async function softDeleteSpatial(tenantId:TenantId,id:string) {
  assertUuid(id,"id");
  return withTenant(tenantId,async(db)=>{
    const before=await db.query({text:"select * from spatial_nodes where id=$1 and deleted_at is null for update",values:[id]});
    if (!before.rows[0]) throw new ApiError(404,"NOT_FOUND","Spatial node not found");
    const children=await db.query({text:"select count(*)::int as count from spatial_nodes where parent_id=$1 and deleted_at is null",values:[id]});
    if (children.rows[0].count>0) throw new ApiError(409,"HAS_CHILDREN","Move or archive child locations before archiving this location");
    const placements=await db.query({text:"select count(*)::int as count from placements where spatial_node_id=$1 and deleted_at is null",values:[id]});
    if (placements.rows[0].count>0) throw new ApiError(409,"HAS_ACTIVE_PLACEMENTS","Remove active product placements before archiving this location");
    const updated=await db.query({text:"update spatial_nodes set deleted_at=now(),updated_at=now() where id=$1 returning id,deleted_at",values:[id]});
    await db.query({
      text:"insert into audit_events (tenant_id,action,entity_type,entity_id,old_data,new_data,metadata) values (current_setting('app.tenant_id')::uuid,'delete','spatial_node',$1,$2::jsonb,$3::jsonb,'{\"source\":\"api\"}')",
      values:[id,JSON.stringify(before.rows[0]),JSON.stringify(updated.rows[0])]
    });
    return updated.rows[0];
  });
}

async function listProducts(tenantId:TenantId,query:string|null) {
  return withTenant(tenantId,async(db)=>{
    const normalized=query?.trim() ? normalizeSearchInput(query) : null;
    const result=normalized
      ? await db.query({text:"select id,sku,barcode,name,category,image_url,status from products where status <> 'archived' and search_text_normalized ilike '%' || app.normalize_search_text($1) || '%' order by name limit 50",values:[likePattern(normalized)]})
      : await db.query("select id,sku,barcode,name,category,image_url,status from products where status <> 'archived' order by name limit 100");
    return result.rows;
  });
}

async function createProduct(tenantId:TenantId,body:Record<string,unknown>) {
  const sku=text(body.sku,"sku",120);
  const name=text(body.name,"name",240);
  const barcode=optionalText(body.barcode,"barcode",120);
  const category=optionalText(body.category,"category",160);
  const imageUrl=optionalText(body.imageUrl,"imageUrl",2048);
  if (imageUrl && !/^https:\/\//i.test(imageUrl)) throw new ApiError(400,"INVALID_INPUT","imageUrl must use HTTPS");
  return withTenant(tenantId,async(db)=>{
    const result=await db.query({text:"insert into products (tenant_id,sku,name,barcode,category,image_url,search_text_normalized) values (current_setting('app.tenant_id')::uuid,$1,$2,$3,$4,$5,app.normalize_search_text($2 || ' ' || $1 || ' ' || coalesce($3,'') || ' ' || coalesce($4,'') || ' ' || coalesce($5,''))) returning id,sku,barcode,name,category,image_url,status",values:[sku,name,barcode,category,imageUrl]});
    await db.query({text:"insert into audit_events (tenant_id,action,entity_type,entity_id,new_data,metadata) values (current_setting('app.tenant_id')::uuid,'create','product',$1,$2::jsonb,'{\"source\":\"api\"}')",values:[result.rows[0].id,JSON.stringify(result.rows[0])]});
    return result.rows[0];
  });
}

async function productLocations(tenantId:TenantId,productId:string) {
  assertUuid(productId,"productId");
  return withTenant(tenantId,async(db)=>{
    const product=await db.query({text:"select id,sku,barcode,name,category,image_url,status from products where id=$1",values:[productId]});
    if (!product.rows[0]) throw new ApiError(404,"NOT_FOUND","Product not found");
    const locations=await db.query({
      text:`select
        p.id as placement_id,p.product_id,p.spatial_node_id,p.status,p.verified_at,
        s.id as node_id,s.parent_id,s.floor_id,s.node_type as type,s.name,s.code,s.x,s.y,s.z,s.width,s.height,s.depth,s.rotation_x,s.rotation_y,s.rotation_z,s.metadata,
        coalesce(inv.inventory,'[]'::jsonb) as inventory
      from placements p
      join spatial_nodes s on s.id=p.spatial_node_id
      left join lateral (
        select jsonb_agg(jsonb_build_object(
          'sourceId',ib.source_id,'sourceName',ins.name,'status',ins.status,'isAuthoritative',ins.is_authoritative,'quantity',ib.quantity::double precision,
          'observedAt',ib.observed_at,'externalLocationRef',ib.external_location_ref
        ) order by ib.observed_at desc) as inventory
        from inventory_balances ib
        join inventory_sources ins on ins.id=ib.source_id
        join inventory_location_mappings ilm on ilm.source_id=ib.source_id
          and ilm.spatial_node_id=p.spatial_node_id
          and ilm.external_location_ref=ib.external_location_ref
        where ib.product_id=p.product_id and ib.deleted_at is null
      ) inv on true
      where p.product_id=$1 and p.deleted_at is null and s.deleted_at is null
      order by p.created_at`,
      values:[productId]
    });
    const allNodes=await db.query({text:"select id,parent_id,floor_id,node_type as type,name,code,x,y,z,width,height,depth,rotation_x,rotation_y,rotation_z,metadata,deleted_at from spatial_nodes where deleted_at is null"});
    const nodes=allNodes.rows.map((n)=>({...n,tenantId}) as never);
    return locations.rows.map((row)=>({
      product:product.rows[0],
      placement:{id:row.placement_id,tenantId,productId:row.product_id,spatialNodeId:row.spatial_node_id,status:row.status,verifiedAt:row.verified_at},
      breadcrumb:breadcrumb(nodes,row.node_id),
      inventory:row.inventory
    }));
  });
}

async function createPlacement(tenantId:TenantId,body:Record<string,unknown>) {
  const productId=assertUuid(body.productId,"productId");
  const spatialNodeId=assertUuid(body.spatialNodeId,"spatialNodeId");
  const reason=optionalText(body.reason,"reason",500);
  return withTenant(tenantId,async(db)=>{
    const product=await db.query({text:"select id from products where id=$1 and status <> 'archived'",values:[productId]});
    if (!product.rows[0]) throw new ApiError(404,"NOT_FOUND","Product not found");
    const node=await db.query({text:"select id from spatial_nodes where id=$1 and deleted_at is null",values:[spatialNodeId]});
    if (!node.rows[0]) throw new ApiError(404,"NOT_FOUND","Spatial location not found");
    const created=await db.query({text:"insert into placements (tenant_id,product_id,spatial_node_id,status,verified_at) values (current_setting('app.tenant_id')::uuid,$1,$2,'placed',now()) returning id,product_id,spatial_node_id,status,verified_at",values:[productId,spatialNodeId]});
    await db.query({text:"insert into placement_history (tenant_id,placement_id,product_id,new_spatial_node_id,source,reason) values (current_setting('app.tenant_id')::uuid,$1,$2,$3,'user',coalesce($4,'Initial placement'))",values:[created.rows[0].id,productId,spatialNodeId,reason]});
    await db.query({text:"insert into audit_events (tenant_id,action,entity_type,entity_id,new_data,metadata) values (current_setting('app.tenant_id')::uuid,'create','placement',$1,$2::jsonb,'{\"source\":\"api\"}')",values:[created.rows[0].id,JSON.stringify(created.rows[0])]});
    return created.rows[0];
  });
}

async function movePlacement(tenantId:TenantId,placementId:string,body:Record<string,unknown>) {
  assertUuid(placementId,"placementId");
  const target=assertUuid(body.spatialNodeId,"spatialNodeId");
  const reason=optionalText(body.reason,"reason",500);
  return withTenant(tenantId,async(db)=>{
    const existing=await db.query({text:"select * from placements where id=$1 and deleted_at is null for update",values:[placementId]});
    if (!existing.rows[0]) throw new ApiError(404,"NOT_FOUND","Placement not found");
    const node=await db.query({text:"select id from spatial_nodes where id=$1 and deleted_at is null",values:[target]});
    if (!node.rows[0]) throw new ApiError(404,"NOT_FOUND","Target location not found");
    if (existing.rows[0].spatial_node_id===target) return existing.rows[0];
    const updated=await db.query({text:"update placements set spatial_node_id=$1,status='placed',verified_at=now(),updated_at=now() where id=$2 returning id,product_id,spatial_node_id,status,verified_at",values:[target,placementId]});
    await db.query({text:"insert into placement_history (tenant_id,placement_id,product_id,old_spatial_node_id,new_spatial_node_id,source,reason) values (current_setting('app.tenant_id')::uuid,$1,$2,$3,$4,'user',coalesce($5,'Moved by user'))",values:[placementId,existing.rows[0].product_id,existing.rows[0].spatial_node_id,target,reason]});
    await db.query({text:"insert into audit_events (tenant_id,action,entity_type,entity_id,old_data,new_data,metadata) values (current_setting('app.tenant_id')::uuid,'move','placement',$1,$2::jsonb,$3::jsonb,'{\"source\":\"api\"}')",values:[placementId,JSON.stringify(existing.rows[0]),JSON.stringify(updated.rows[0])]});
    return updated.rows[0];
  });
}

async function deletePlacement(tenantId:TenantId,placementId:string) {
  assertUuid(placementId,"placementId");
  return withTenant(tenantId,async(db)=>{
    const existing=await db.query({text:"select * from placements where id=$1 and deleted_at is null for update",values:[placementId]});
    if (!existing.rows[0]) throw new ApiError(404,"NOT_FOUND","Placement not found");
    const updated=await db.query({text:"update placements set deleted_at=now(),status='missing_location',updated_at=now() where id=$1 returning id,product_id,spatial_node_id,status,verified_at,deleted_at",values:[placementId]});
    await db.query({text:"insert into placement_history (tenant_id,placement_id,product_id,old_spatial_node_id,source,reason) values (current_setting('app.tenant_id')::uuid,$1,$2,$3,'user','Placement removed')",values:[placementId,existing.rows[0].product_id,existing.rows[0].spatial_node_id]});
    await db.query({text:"insert into audit_events (tenant_id,action,entity_type,entity_id,old_data,new_data,metadata) values (current_setting('app.tenant_id')::uuid,'delete','placement',$1,$2::jsonb,$3::jsonb,'{\"source\":\"api\"}')",values:[placementId,JSON.stringify(existing.rows[0]),JSON.stringify(updated.rows[0])]});
    return updated.rows[0];
  });
}

async function overview(tenantId:TenantId) {
  return withTenant(tenantId,async(db)=>{
    const result=await db.query("select (select count(*)::int from products where status <> 'archived') as products,(select count(*)::int from spatial_nodes where deleted_at is null) as spatial_nodes,(select count(*)::int from placements where deleted_at is null) as placements,(select count(*)::int from inventory_sources) as inventory_sources,(select max(created_at) from audit_events) as last_activity");
    return result.rows[0];
  });
}

async function listInventorySources(tenantId:TenantId) {
  return withTenant(tenantId,async(db)=>{
    const result=await db.query("select id,provider_type,name,location_ref,status,is_authoritative,last_synced_at from inventory_sources order by name");
    return result.rows;
  });
}



async function listIntegrations(tenantId:TenantId) {
  return withTenant(tenantId,async(db)=>{
    const result=await db.query({
      text:`select
        c.id,c.provider_type,c.name,c.base_url,c.provider_database,c.enabled,
        c.last_healthcheck_at,c.last_error,
        s.id as source_id,s.status as source_status,s.is_authoritative,s.last_synced_at
      from integration_connections c
      left join inventory_sources s on s.connection_id=c.id
      order by c.name`
    });
    return result.rows;
  });
}

async function createOdooConnection(tenantId:TenantId,body:Record<string,unknown>) {
  const name=text(body.name,"name",160);
  const baseUrl=text(body.baseUrl,"baseUrl",2048).replace(/\/$/,"");
  if (!/^https:\/\//i.test(baseUrl)) throw new ApiError(400,"INVALID_INPUT","Odoo baseUrl must use HTTPS");
  const database=optionalText(body.database,"database",120);
  const apiKey=text(body.apiKey,"apiKey",2048);
  try {
    await assertSafeOutboundUrl(baseUrl);
  } catch(error) {
    throw new ApiError(400,"INVALID_INPUT",error instanceof Error?error.message:"Odoo URL is not allowed");
  }
  const encryptedSecret=encryptSecret(apiKey);

  return withTenant(tenantId,async(db)=>{
    const connection=await db.query({
      text:`insert into integration_connections
        (tenant_id,provider_type,name,base_url,provider_database,encrypted_secret,enabled)
        values (current_setting('app.tenant_id')::uuid,'odoo',$1,$2,$3,$4,true)
        returning id,provider_type,name,base_url,provider_database,enabled,last_healthcheck_at,last_error`,
      values:[name,baseUrl,database,encryptedSecret]
    });
    const source=await db.query({
      text:`insert into inventory_sources
        (tenant_id,provider_type,name,status,is_authoritative,connection_id)
        values (current_setting('app.tenant_id')::uuid,'odoo',$1,'disconnected',true,$2)
        returning id,status,is_authoritative,last_synced_at`,
      values:[name,connection.rows[0].id]
    });
    await db.query({
      text:"insert into audit_events (tenant_id,action,entity_type,entity_id,new_data,metadata) values (current_setting('app.tenant_id')::uuid,'create','integration_connection',$1,$2::jsonb,'{\"source\":\"api\",\"provider\":\"odoo\"}')",
      values:[connection.rows[0].id,JSON.stringify({provider_type:"odoo",name,base_url:baseUrl,provider_database:database,source_id:source.rows[0].id})]
    });
    return {...connection.rows[0],source_id:source.rows[0].id,source_status:source.rows[0].status,is_authoritative:source.rows[0].is_authoritative,last_synced_at:null};
  });
}

async function getOdooConnection(tenantId:TenantId,connectionId:string) {
  assertUuid(connectionId,"connectionId");
  return withTenant(tenantId,async(db)=>{
    const result=await db.query({
      text:"select c.id,c.name,c.base_url,c.provider_database,c.encrypted_secret,c.enabled,s.id as source_id from integration_connections c join inventory_sources s on s.connection_id=c.id where c.id=$1 and c.provider_type='odoo'",
      values:[connectionId]
    });
    if(!result.rows[0]) throw new ApiError(404,"NOT_FOUND","Odoo integration not found");
    if(!result.rows[0].enabled) throw new ApiError(409,"INTEGRATION_DISABLED","Integration is disabled");
    return result.rows[0];
  });
}

async function odooHealth(tenantId:TenantId,connectionId:string) {
  const connection=await getOdooConnection(tenantId,connectionId);
  let health;
  try {
    const connector=new OdooConnector({
      baseUrl:connection.base_url,
      database:connection.provider_database ?? undefined,
      apiKey:decryptSecret(connection.encrypted_secret)
    });
    health=await connector.health({tenantId,sourceId:connection.source_id});
  } catch(error) {
    health={status:"error" as const,checkedAt:new Date().toISOString(),message:error instanceof Error?error.message:"Integration health check failed"};
  }
  await withTenant(tenantId,async(db)=>{
    await db.query({
      text:"update integration_connections set last_healthcheck_at=$1,last_error=$2,updated_at=now() where id=$3",
      values:[health.checkedAt,health.status==="error"?health.message:null,connectionId]
    });
    await db.query({
      text:"update inventory_sources set status=$1,updated_at=now() where connection_id=$2",
      values:[health.status,connectionId]
    });
  });
  return health;
}

async function listIntegrationLocations(tenantId:TenantId,connectionId:string) {
  assertUuid(connectionId,"connectionId");
  return withTenant(tenantId,async(db)=>{
    const result=await db.query({
      text:"select id,external_location_id,parent_external_location_id,name,complete_name,usage,active,synced_at from integration_locations where connection_id=$1 order by complete_name nulls last,name",
      values:[connectionId]
    });
    return result.rows;
  });
}

async function syncOdooConnection(tenantId:TenantId,connectionId:string) {
  const connection=await getOdooConnection(tenantId,connectionId);
  const sourceId=connection.source_id as string;
  const connector=new OdooConnector({
    baseUrl:connection.base_url,
    database:connection.provider_database ?? undefined,
    apiKey:decryptSecret(connection.encrypted_secret)
  });

  await withTenant(tenantId,async(db)=>{
    await db.query({text:"update inventory_sources set status='syncing',updated_at=now() where id=$1",values:[sourceId]});
    await db.query({text:"update integration_connections set last_error=null,updated_at=now() where id=$1",values:[connectionId]});
  });

  try {
    const products=await connector.listProducts({tenantId,sourceId});
    const locations=await connector.listLocations({tenantId,sourceId});
    const stock=await connector.listStock({tenantId,sourceId});

    const result=await withTenant(tenantId,async(db)=>{
      const mappingsResult=await db.query({
        text:"select external_product_id,product_id from integration_product_mappings where source_id=$1",
        values:[sourceId]
      });
      const productMap=new Map<string,string>(mappingsResult.rows.map((row)=>[String(row.external_product_id),String(row.product_id)]));
      let productsCreated=0,productsUpdated=0,stockRows=0,stockSkipped=0,locationsUpserted=0;

      for(const product of products){
        let productId=productMap.get(product.externalProductId);
        if(productId){
          const updated=await db.query({
            text:"update products set sku=$1,name=$2,barcode=$3,category=$4,image_url=$5,search_text_normalized=app.normalize_search_text($2 || ' ' || $1 || ' ' || coalesce($3,'') || ' ' || coalesce($4,'') || ' ' || coalesce($5,'')),status='active',updated_at=now() where id=$6 returning id",
            values:[product.sku,product.name,product.barcode,product.category,product.imageUrl,productId]
          });
          if(!updated.rows[0]) productId=undefined;
        }
        if(!productId){
          const upsert=await db.query({
            text:"insert into products (tenant_id,sku,name,barcode,category,image_url,search_text_normalized) values (current_setting('app.tenant_id')::uuid,$1,$2,$3,$4,$5,app.normalize_search_text($2 || ' ' || $1 || ' ' || coalesce($3,'') || ' ' || coalesce($4,'') || ' ' || coalesce($5,''))) on conflict (tenant_id,sku) do update set name=excluded.name,barcode=excluded.barcode,category=excluded.category,image_url=excluded.image_url,search_text_normalized=excluded.search_text_normalized,status='active',updated_at=now() returning id,xmin",
            values:[product.sku,product.name,product.barcode,product.category,product.imageUrl]
          });
          productId=String(upsert.rows[0].id);
          productsUpdated++;
          if(String(upsert.rows[0].xmin)==="0") productsCreated++;
          await db.query({
            text:"insert into integration_product_mappings (tenant_id,source_id,external_product_id,product_id) values (current_setting('app.tenant_id')::uuid,$1,$2,$3) on conflict (tenant_id,source_id,external_product_id) do update set product_id=excluded.product_id,updated_at=now()",
            values:[sourceId,product.externalProductId,productId]
          });
          productMap.set(product.externalProductId,productId);
        }
      }

      for(const location of locations){
        await db.query({
          text:"insert into integration_locations
          (tenant_id,connection_id,external_location_id,parent_external_location_id,name,complete_name,usage,raw_metadata,synced_at)
          values (current_setting('app.tenant_id')::uuid,$1,$2,$3,$4,$5,$6,$7::jsonb,now())
          on conflict (tenant_id,connection_id,external_location_id) do update
            set parent_external_location_id=excluded.parent_external_location_id,
                name=excluded.name,
                complete_name=excluded.complete_name,
                usage=excluded.usage,
                raw_metadata=excluded.raw_metadata,
                active=true,
                synced_at=excluded.synced_at",
          values:[connectionId,location.externalLocationId,location.parentExternalLocationId??null,location.name,location.completeName??null,location.usage??null,JSON.stringify(location)]
        });
        locationsUpserted++;
      }

      for(const item of stock){
        const productId=productMap.get(item.externalProductId);
        if(!productId||item.externalLocationId===null){stockSkipped++;continue;}
        await db.query({
          text:"insert into inventory_balances (tenant_id,source_id,product_id,external_location_ref,quantity,observed_at) values (current_setting('app.tenant_id')::uuid,$1,$2,$3,$4::numeric, $5) on conflict (tenant_id,source_id,product_id,external_location_ref) do update set quantity=excluded.quantity,observed_at=excluded.observed_at,updated_at=now(),deleted_at=null",
          values:[sourceId,productId,item.externalLocationId,item.quantity,item.updatedAt]
        });
        stockRows++;
      }

      await db.query({text:"update inventory_sources set status='connected',last_synced_at=now(),updated_at=now() where id=$1",values:[sourceId]});
      await db.query({text:"update integration_connections set last_healthcheck_at=now(),last_error=null,updated_at=now() where id=$1",values:[connectionId]});
      await db.query({
        text:"insert into audit_events (tenant_id,action,entity_type,entity_id,metadata) values (current_setting('app.tenant_id')::uuid,'sync','integration_connection',$1,$2::jsonb)",
        values:[connectionId,JSON.stringify({provider:"odoo",sourceId,products:products.length,productsCreated,productsUpdated,locationsUpserted,stockRows,stockSkipped})]
      });

      return {products:products.length,productsCreated,productsUpdated,locationsUpserted,stockRows,stockSkipped};
    });
    return result;
  } catch(error) {
    const message=error instanceof Error?error.message:"Odoo sync failed";
    await withTenant(tenantId,async(db)=>{
      await db.query({text:"update inventory_sources set status='error',updated_at=now() where id=$1",values:[sourceId]});
      await db.query({text:"update integration_connections set last_error=$1,updated_at=now() where id=$2",values:[message.slice(0,1000),connectionId]});
    });
    throw new ApiError(502,"INTEGRATION_SYNC_FAILED","Odoo synchronization failed");
  }
}

async function createInventorySource(tenantId:TenantId,body:Record<string,unknown>) {
  const providerType=text(body.providerType,"providerType",60);
  const name=text(body.name,"name",160);
  const locationRef=optionalText(body.locationRef,"locationRef",160);
  const isAuthoritative=body.isAuthoritative===undefined ? true : body.isAuthoritative===true;
  return withTenant(tenantId,async(db)=>{
    const result=await db.query({
      text:"insert into inventory_sources (tenant_id,provider_type,name,location_ref,status,is_authoritative) values (current_setting('app.tenant_id')::uuid,$1,$2,$3,'disconnected',$4) returning id,provider_type,name,location_ref,status,is_authoritative,last_synced_at",
      values:[providerType,name,locationRef,isAuthoritative]
    });
    await db.query({text:"insert into audit_events (tenant_id,action,entity_type,entity_id,new_data,metadata) values (current_setting('app.tenant_id')::uuid,'create','inventory_source',$1,$2::jsonb,'{\"source\":\"api\"}')",values:[result.rows[0].id,JSON.stringify(result.rows[0])]});
    return result.rows[0];
  });
}

async function createInventoryMapping(tenantId:TenantId,body:Record<string,unknown>) {
  const sourceId=assertUuid(body.sourceId,"sourceId");
  const spatialNodeId=assertUuid(body.spatialNodeId,"spatialNodeId");
  const externalLocationRef=text(body.externalLocationRef,"externalLocationRef",160);
  return withTenant(tenantId,async(db)=>{
    const source=await db.query({text:"select id from inventory_sources where id=$1",values:[sourceId]});
    if(!source.rows[0]) throw new ApiError(404,"NOT_FOUND","Inventory source not found");
    const node=await db.query({text:"select id from spatial_nodes where id=$1 and deleted_at is null",values:[spatialNodeId]});
    if(!node.rows[0]) throw new ApiError(404,"NOT_FOUND","Spatial location not found");
    const result=await db.query({
      text:"insert into inventory_location_mappings (tenant_id,source_id,spatial_node_id,external_location_ref) values (current_setting('app.tenant_id')::uuid,$1,$2,$3) on conflict (tenant_id,source_id,external_location_ref) do update set spatial_node_id=excluded.spatial_node_id,updated_at=now() returning id,source_id,spatial_node_id,external_location_ref",
      values:[sourceId,spatialNodeId,externalLocationRef]
    });
    await db.query({text:"insert into audit_events (tenant_id,action,entity_type,entity_id,new_data,metadata) values (current_setting('app.tenant_id')::uuid,'map','inventory_location_mapping',$1,$2::jsonb,'{\"source\":\"api\"}')",values:[result.rows[0].id,JSON.stringify(result.rows[0])]});
    return result.rows[0];
  });
}

async function importProducts(tenantId:TenantId,body:Record<string,unknown>) {
  const rows=bodyRows(body.rows);
  const sourceId=body.sourceId==null ? null : assertUuid(body.sourceId,"sourceId");
  return withTenant(tenantId,async(db)=>{
    if (sourceId) {
      const source=await db.query({text:"select id from inventory_sources where id=$1 and is_authoritative=true",values:[sourceId]});
      if (!source.rows[0]) throw new ApiError(400,"INVALID_SOURCE","sourceId must reference an authoritative inventory source");
    }
    let created=0,updated=0;
    for (const row of rows) {
      const sku=text(row.sku ?? row.SKU,"sku",120);
      const name=text(row.name ?? row["Product Name"],"name",240);
      const barcode=optionalText(row.barcode ?? row.Barcode,"barcode",120);
      const category=optionalText(row.category ?? row.Category,"category",160);
      const imageUrl=optionalText(row.imageUrl ?? row["Image URL"],"imageUrl",2048);
      if (imageUrl && !/^https:\/\//i.test(imageUrl)) throw new ApiError(400,"INVALID_INPUT","Imported imageUrl must use HTTPS");
      const upsert=await db.query({
        text:"insert into products (tenant_id,sku,name,barcode,category,image_url) values (current_setting('app.tenant_id')::uuid,$1,$2,$3,$4,$5) on conflict (tenant_id,sku) do update set name=excluded.name,barcode=excluded.barcode,category=excluded.category,image_url=excluded.image_url,status='active',updated_at=now() returning xmax,id,sku",
        values:[sku,name,barcode,category,imageUrl]
      });
      if (Number(upsert.rows[0].xmax)===0) created++; else updated++;
      if (sourceId && row.quantity!==undefined) {
        const quantity=integer(row.quantity,"quantity",0,2_000_000_000);
        const externalLocationRef=optionalText(row.locationCode ?? row["Location Code"],"locationCode",160);
        if (externalLocationRef===null) throw new ApiError(400,"INVALID_INPUT","locationCode is required when importing quantity");
        const mapped=await db.query({
          text:"select spatial_node_id from inventory_location_mappings where source_id=$1 and external_location_ref=$2",
          values:[sourceId,externalLocationRef]
        });
        if(!mapped.rows[0]){
          const byCode=await db.query({
            text:"select id from spatial_nodes where code=$1 and deleted_at is null",
            values:[externalLocationRef]
          });
          if(byCode.rows.length!==1) {
            throw new ApiError(409,"LOCATION_MAPPING_REQUIRED","Location Code does not map uniquely to a spatial node",{locationCode:externalLocationRef});
          }
          await db.query({
            text:"insert into inventory_location_mappings (tenant_id,source_id,spatial_node_id,external_location_ref) values (current_setting('app.tenant_id')::uuid,$1,$2,$3)",
            values:[sourceId,byCode.rows[0].id,externalLocationRef]
          });
        }
        await db.query({
          text:"insert into inventory_balances (tenant_id,source_id,product_id,external_location_ref,quantity,observed_at) values (current_setting('app.tenant_id')::uuid,$1,$2,$3,$4,now()) on conflict (tenant_id,source_id,product_id,external_location_ref) do update set quantity=excluded.quantity,observed_at=excluded.observed_at,updated_at=now(),deleted_at=null",
          values:[sourceId,upsert.rows[0].id,externalLocationRef,quantity]
        });
      }
    }
    if(sourceId){
      await db.query({text:"update inventory_sources set status='connected',last_synced_at=now(),updated_at=now() where id=$1",values:[sourceId]});
    }
    await db.query({text:"insert into audit_events (tenant_id,action,entity_type,metadata) values (current_setting('app.tenant_id')::uuid,'import','product_import',$1::jsonb)",values:[JSON.stringify({rows:rows.length,created,updated,sourceId})]});
    return {rows:rows.length,created,updated};
  });
}

function parseUrl(req:IncomingMessage){return new URL(req.url ?? "/","http://localhost");}

async function route(req:IncomingMessage,res:ServerResponse){
  const url=parseUrl(req); const method=req.method ?? "GET";
  if (!applyCors(req,res)) return;
  if (method==="OPTIONS"){res.statusCode=204;res.end();return;}
  if (url.pathname==="/health" && method==="GET"){
    try{const ok=await healthcheck();sendJson(res,ok?200:503,{ok,database:ok?"connected":"not_configured"});}
    catch{sendJson(res,503,{ok:false,database:"unavailable"});}
    return;
  }
  const limited=limiter.check(clientKey(req));
  if (!limited.allowed){sendJson(res,429,{error:{code:"RATE_LIMITED",message:"Too many requests"}},{"retry-after":String(limited.retryAfterSeconds)});return;}
  const tenantId=resolveTenant(req);

  if (url.pathname==="/api/overview" && method==="GET") return sendJson(res,200,await overview(tenantId));
  if (url.pathname==="/api/spatial" && method==="GET") return sendJson(res,200,await listSpatial(tenantId,url.searchParams.get("q")));
  if (url.pathname==="/api/spatial" && method==="POST") return sendJson(res,201,await createSpatial(tenantId,await readJson(req)));
  if (url.pathname==="/api/products" && method==="GET") return sendJson(res,200,await listProducts(tenantId,url.searchParams.get("q")));
  if (url.pathname==="/api/products" && method==="POST") return sendJson(res,201,await createProduct(tenantId,await readJson(req)));
  if (url.pathname==="/api/integrations" && method==="GET") return sendJson(res,200,await listIntegrations(tenantId));
  if (url.pathname==="/api/integrations/odoo" && method==="POST") return sendJson(res,201,await createOdooConnection(tenantId,await readJson(req)));
  if (url.pathname==="/api/inventory-sources" && method==="GET") return sendJson(res,200,await listInventorySources(tenantId));
  if (url.pathname==="/api/inventory-sources" && method==="POST") return sendJson(res,201,await createInventorySource(tenantId,await readJson(req)));
  if (url.pathname==="/api/inventory-location-mappings" && method==="POST") return sendJson(res,201,await createInventoryMapping(tenantId,await readJson(req)));
  const odooHealthMatch=url.pathname.match(/^\/api\/integrations\/odoo\/([0-9a-f-]+)\/health$/i);
  if (odooHealthMatch && method==="POST") return sendJson(res,200,await odooHealth(tenantId,odooHealthMatch[1]));
  const odooSyncMatch=url.pathname.match(/^\/api\/integrations\/odoo\/([0-9a-f-]+)\/sync$/i);
  if (odooSyncMatch && method==="POST") return sendJson(res,200,await syncOdooConnection(tenantId,odooSyncMatch[1]));
  const integrationLocationsMatch=url.pathname.match(/^\/api\/integrations\/([0-9a-f-]+)\/locations$/i);
  if (integrationLocationsMatch && method==="GET") return sendJson(res,200,await listIntegrationLocations(tenantId,integrationLocationsMatch[1]));
  if (url.pathname==="/api/placements" && method==="POST") return sendJson(res,201,await createPlacement(tenantId,await readJson(req)));
  if (url.pathname==="/api/import/products" && method==="POST") return sendJson(res,200,await importProducts(tenantId,await readJson(req)));

  const productLocationMatch=url.pathname.match(/^\/api\/products\/([0-9a-f-]+)\/locations$/i);
  if (productLocationMatch && method==="GET") return sendJson(res,200,await productLocations(tenantId,productLocationMatch[1]));

  const spatialProductsMatch=url.pathname.match(/^\/api\/spatial\/([0-9a-f-]+)\/products$/i);
  if (spatialProductsMatch && method==="GET") return sendJson(res,200,await spatialProducts(tenantId,spatialProductsMatch[1]));

  const spatialMatch=url.pathname.match(/^\/api\/spatial\/([0-9a-f-]+)$/i);
  if (spatialMatch && method==="GET") return sendJson(res,200,await getSpatial(tenantId,spatialMatch[1]));
  if (spatialMatch && method==="PATCH") return sendJson(res,200,await updateSpatial(tenantId,spatialMatch[1],await readJson(req)));
  if (spatialMatch && method==="DELETE") return sendJson(res,200,await softDeleteSpatial(tenantId,spatialMatch[1]));

  const placementMatch=url.pathname.match(/^\/api\/placements\/([0-9a-f-]+)$/i);
  if (placementMatch && method==="PATCH") return sendJson(res,200,await movePlacement(tenantId,placementMatch[1],await readJson(req)));
  if (placementMatch && method==="DELETE") return sendJson(res,200,await deletePlacement(tenantId,placementMatch[1]));

  throw new ApiError(404,"NOT_FOUND","Route not found");
}

createServer(async(req,res)=>{
  securityHeaders(res);
  const id=requestId();
  res.setHeader("x-request-id",id);
  try{await route(req,res);}
  catch(error){
    if (error instanceof ApiError){sendJson(res,error.status,{error:{code:error.code,message:error.message,requestId:id,...(error.details ? {details:error.details}:{})}});return;}
    const mapped=dbError(error);
    if (mapped){sendJson(res,mapped.status,{error:{code:mapped.code,message:mapped.message,requestId:id}});return;}
    console.error(JSON.stringify({requestId:id,error:error instanceof Error?error.message:"unknown"}));
    sendJson(res,500,{error:{code:"INTERNAL_ERROR",message:"Internal server error",requestId:id}});
  }
}).listen(port,()=>console.log(`Spatial Inventory API listening on :${port}`));
