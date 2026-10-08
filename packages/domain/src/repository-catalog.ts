export type RepositoryRole = "runtime" | "integration" | "reference" | "future";

export interface RepositoryCatalogEntry {
  id:string;
  name:string;
  repository:string;
  role:RepositoryRole;
  status:"implemented"|"registered"|"planned";
  description:string;
}

export const REPOSITORY_CATALOG:RepositoryCatalogEntry[] = [
  {id:"react-three-fiber",name:"React Three Fiber",repository:"https://github.com/pmndrs/react-three-fiber",role:"runtime",status:"implemented",description:"Primary React 3D renderer"},
  {id:"drei",name:"Drei",repository:"https://github.com/pmndrs/drei",role:"runtime",status:"implemented",description:"React Three Fiber helpers"},
  {id:"zxing-browser",name:"ZXing Browser",repository:"https://github.com/zxing-js/browser",role:"runtime",status:"implemented",description:"Browser barcode scanning"},
  {id:"openplan3d",name:"openPlan3D",repository:"https://github.com/laanlabs/openPlan3D",role:"reference",status:"registered",description:"2D/3D floor-plan editor reference"},
  {id:"blueprint3d-modern",name:"Blueprint3D Modern",repository:"https://github.com/charmlinn/blueprint3d-modern",role:"reference",status:"registered",description:"Floor-plan and 3D interaction reference"},
  {id:"3d-warehouse",name:"3d-warehouse",repository:"https://github.com/astopaal/3d-warehouse",role:"reference",status:"registered",description:"Data-driven warehouse visualization reference"},
  {id:"warehouse-digital-twin",name:"WarehouseDigitalTwin",repository:"https://github.com/Alibadloo/WarehouseDigitalTwin",role:"reference",status:"registered",description:"Digital-twin architecture reference"},
  {id:"waretwin",name:"WareTwin",repository:"https://github.com/ltinphan/waretwin",role:"reference",status:"registered",description:"Advanced warehouse digital-twin reference"},
  {id:"inventory-management-system",name:"Inventory Management System",repository:"https://github.com/kerroumiFati/inventory-management-system",role:"reference",status:"registered",description:"Inventory, barcode and offline UX reference"},
  {id:"inventory-pos",name:"Inventory-POS",repository:"https://github.com/Haseebaleem/Inventory-POS",role:"reference",status:"registered",description:"Inventory/POS workflow reference"},
  {id:"odoo",name:"Odoo",repository:"https://github.com/odoo/odoo",role:"integration",status:"implemented",description:"Implemented first external inventory connector"},
  {id:"erpnext",name:"ERPNext",repository:"https://github.com/frappe/erpnext",role:"integration",status:"registered",description:"Integration Hub target; canonical mapping boundary"},
  {id:"dolibarr",name:"Dolibarr",repository:"https://github.com/Dolibarr/dolibarr",role:"integration",status:"registered",description:"Integration Hub target"},
  {id:"woocommerce",name:"WooCommerce REST API",repository:"https://github.com/woocommerce/woocommerce-rest-api",role:"integration",status:"registered",description:"Integration Hub target"},
  {id:"shopify",name:"Shopify Webhooks/API",repository:"https://shopify.dev/docs/api/admin-rest",role:"integration",status:"registered",description:"Integration Hub target"},
  {id:"saleor",name:"Saleor",repository:"https://github.com/saleor/saleor",role:"integration",status:"registered",description:"Integration Hub target"},
  {id:"medusa",name:"Medusa",repository:"https://github.com/medusajs/medusa",role:"integration",status:"registered",description:"Integration Hub target"},
  {id:"vendure",name:"Vendure",repository:"https://github.com/vendurehq/vendure",role:"integration",status:"registered",description:"Integration Hub target"},
  {id:"generic-rest",name:"Generic REST API",repository:"https://developer.mozilla.org/en-US/docs/Web/HTTP",role:"integration",status:"registered",description:"Configured endpoint and field-mapping boundary"},
  {id:"generic-graphql",name:"Generic GraphQL API",repository:"https://graphql.org/",role:"integration",status:"registered",description:"Configured schema/query mapping boundary"},
  {id:"postgres-readonly",name:"PostgreSQL read-only",repository:"https://www.postgresql.org/",role:"integration",status:"registered",description:"Controlled read-only database integration boundary"},
  {id:"csv-excel",name:"CSV / Excel",repository:"https://github.com/SheetJS/sheetjs",role:"integration",status:"implemented",description:"Import foundation; provider-neutral inventory intake"},
  {id:"generic-webhook",name:"Generic Webhook Receiver",repository:"https://github.com/taskforcesh/bullmq",role:"integration",status:"registered",description:"Webhook/event intake boundary; processing remains idempotent"},
];

export const ACTIVE_INTEGRATION_CATALOG = REPOSITORY_CATALOG.filter((entry)=>entry.role==="integration");
export const SPATIAL_REFERENCE_CATALOG = REPOSITORY_CATALOG.filter((entry)=>entry.role==="reference");
