import { Client, neon } from "@neondatabase/serverless";
import type { TenantId } from "@spatial/domain";

const databaseUrl=process.env.DATABASE_URL;

export class DatabaseUnavailableError extends Error {
  constructor(){super("Database is not configured");this.name="DatabaseUnavailableError";}
}

export async function healthcheck():Promise<boolean>{
  if(!databaseUrl)return false;
  const sql=neon(databaseUrl);
  await sql`select 1 as ok`;
  return true;
}

export async function withTenant<T>(tenantId:TenantId,fn:(client:Client)=>Promise<T>):Promise<T>{
  if(!databaseUrl)throw new DatabaseUnavailableError();
  const client=new Client(databaseUrl);
  await client.connect();
  try{
    await client.query("begin");
    await client.query("select app.set_tenant_context($1::uuid)",[tenantId]);
    const result=await fn(client);
    await client.query("commit");
    return result;
  }catch(error){
    try{await client.query("rollback");}catch{}
    throw error;
  }finally{
    await client.end();
  }
}
