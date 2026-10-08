import { assertSafeOutboundUrl } from "./outbound-url";
import type { CanonicalProduct, CanonicalStock, CanonicalLocation, ConnectorContext, ConnectorHealth, InventoryConnector } from "./index";

export interface OdooConnectorConfig {
  baseUrl: string;
  database?: string;
  apiKey: string;
  userAgent?: string;
}

type OdooRecord = Record<string, unknown>;

export class OdooConnector implements InventoryConnector {
  readonly id = "odoo-json2";
  readonly displayName = "Odoo 19 JSON-2";

  constructor(private readonly config: OdooConnectorConfig) {
    this.config.baseUrl = this.config.baseUrl.replace(/\/$/, "");
    if (!/^https:\/\//i.test(this.config.baseUrl)) throw new Error("Odoo base URL must use HTTPS");
  }

  private async call(model: string, method: string, body: OdooRecord, signal?: AbortSignal): Promise<unknown> {
    await assertSafeOutboundUrl(this.config.baseUrl);
    const headers: Record<string,string> = {
      authorization: `bearer ${this.config.apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": this.config.userAgent ?? "Spatial-Inventory/0.1"
    };
    if (this.config.database) headers["x-odoo-database"] = this.config.database;
    const response = await fetch(
      `${this.config.baseUrl}/json/2/${encodeURIComponent(model)}/${encodeURIComponent(method)}`,
      {method:"POST",headers,body:JSON.stringify(body),signal}
    );
    if (!response.ok) {
      const message = await response.text().catch(()=>"");
      throw new Error(`Odoo ${response.status}: ${message.slice(0,500)}`);
    }
    return response.json();
  }

  private async searchRead(model:string,fields:string[],domain:unknown[],context:Record<string,unknown>|undefined,signal:AbortSignal|undefined,maxRows:number):Promise<OdooRecord[]> {
    const pageSize=500;
    const rows:OdooRecord[]=[];
    for(let offset=0;offset<maxRows;offset+=pageSize){
      const page=await this.call(model,"search_read",{domain,fields,context,offset,limit:pageSize},signal);
      if(!Array.isArray(page))throw new Error(`Unexpected Odoo response for ${model}`);
      rows.push(...page.filter((item):item is OdooRecord=>Boolean(item)&&typeof item==="object"));
      if(page.length<pageSize)break;
    }
    return rows;
  }

  async health(context:ConnectorContext):Promise<ConnectorHealth>{
    const checkedAt=new Date().toISOString();
    try{
      await this.call("res.users","context_get",{},context.signal);
      return {status:"connected",checkedAt};
    }catch(error){
      return {status:"error",checkedAt,message:error instanceof Error?error.message:"Odoo health check failed"};
    }
  }

  async listProducts(context:ConnectorContext):Promise<CanonicalProduct[]>{
    const rows=await this.searchRead(
      "product.product",
      ["id","default_code","barcode","name","categ_id"],
      [["active","=",true]],
      {lang:"en_US"},
      context.signal,
      5000
    );
    return rows.map((row)=>({
      externalSource:"odoo",
      externalProductId:String(row.id),
      sku:typeof row.default_code==="string"&&row.default_code?row.default_code:`ODOO-${row.id}`,
      barcode:typeof row.barcode==="string"&&row.barcode?row.barcode:null,
      name:typeof row.name==="string"?row.name:`Odoo product ${row.id}`,
      imageUrl:null,
      category:Array.isArray(row.categ_id)&&typeof row.categ_id[1]==="string"?row.categ_id[1]:null,
      attributes:{providerModel:"product.product"}
    }));
  }

  async listStock(context:ConnectorContext):Promise<CanonicalStock[]>{
    const rows=await this.searchRead(
      "stock.quant",
      ["id","product_id","location_id","quantity","reserved_quantity"],
      [["location_id.usage","=","internal"]],
      undefined,
      context.signal,
      10000
    );
    return rows.flatMap((row)=>{
      const productId=Array.isArray(row.product_id)?row.product_id[0]:row.product_id;
      const locationId=Array.isArray(row.location_id)?row.location_id[0]:row.location_id;
      const quantity=Number(row.quantity);
      const reserved=Number(row.reserved_quantity);
      if(productId==null||locationId==null||!Number.isFinite(quantity)||quantity<0)return [];
      return [{
        externalSource:"odoo",
        externalProductId:String(productId),
        quantity,
        availableQuantity:Number.isFinite(reserved)?Math.max(0,quantity-reserved):null,
        reservedQuantity:Number.isFinite(reserved)?reserved:null,
        externalLocationId:String(locationId),
        updatedAt:new Date().toISOString()
      }];
    });
  }

  async listLocations(context:ConnectorContext):Promise<CanonicalLocation[]>{
    const rows=await this.searchRead(
      "stock.location",
      ["id","name","complete_name","location_id","usage","active"],
      [["usage","in",["internal","view"]]],
      {lang:"en_US"},
      context.signal,
      10000
    );
    return rows.map((row)=>({
      externalLocationId:String(row.id),
      name:typeof row.name==="string"?row.name:`Odoo location ${row.id}`,
      code:null,
      type:typeof row.usage==="string"?row.usage:"unknown",
      parentExternalLocationId:Array.isArray(row.location_id)&&row.location_id[0]!=null?String(row.location_id[0]):null,
      completeName:typeof row.complete_name==="string"?row.complete_name:null,
      usage:typeof row.usage==="string"?row.usage:null
    }));
  }
}
