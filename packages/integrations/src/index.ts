export interface CanonicalProduct {
  externalSource:string;
  externalProductId:string;
  sku:string;
  barcode:string|null;
  name:string;
  imageUrl:string|null;
  category:string|null;
  attributes:Record<string,unknown>;
}
export interface CanonicalStock {
  externalSource:string;
  externalProductId:string;
  quantity:number;
  availableQuantity:number|null;
  reservedQuantity:number|null;
  externalLocationId:string|null;
  updatedAt:string;
}
export interface CanonicalLocation {
  externalLocationId:string;
  name:string;
  code:string|null;
  type:string;
  parentExternalLocationId?:string|null;
  completeName?:string|null;
  usage?:string|null;
}
export interface CanonicalEvent {
  externalSource:string;
  externalEventId:string;
  eventType:string;
  productExternalId:string|null;
  quantityDelta:number|null;
  quantityAfter:number|null;
  externalLocationId:string|null;
  occurredAt:string|null;
  payload:Record<string,unknown>;
}
export interface ConnectorContext {
  tenantId:string;
  sourceId:string;
  signal?:AbortSignal;
}
export interface ConnectorHealth {
  status:"connected"|"syncing"|"delayed"|"disconnected"|"error";
  checkedAt:string;
  message?:string;
}
export interface InventoryConnector {
  readonly id:string;
  readonly displayName:string;
  health(context:ConnectorContext):Promise<ConnectorHealth>;
  listProducts(context:ConnectorContext):Promise<CanonicalProduct[]>;
  listStock(context:ConnectorContext):Promise<CanonicalStock[]>;
  listLocations?(context:ConnectorContext):Promise<CanonicalLocation[]>;
}
export function assertFiniteQuantity(value:number):void {
  if(!Number.isFinite(value)||value<0) throw new Error("Connector returned an invalid quantity");
}
export { OdooConnector } from "./odoo";
export type { OdooConnectorConfig } from "./odoo";
