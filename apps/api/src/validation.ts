import { randomUUID } from "node:crypto";

export class ApiError extends Error {
  constructor(
    public readonly status:number,
    public readonly code:string,
    message:string,
    public readonly details?:Record<string,unknown>
  ){super(message);this.name="ApiError";}
}
export const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertUuid(value:unknown,label:string):string{
  if(typeof value!=="string"||!UUID_RE.test(value))throw new ApiError(400,"INVALID_INPUT",`${label} must be a UUID`);
  return value;
}
export function text(value:unknown,label:string,max=200):string{
  if(typeof value!=="string")throw new ApiError(400,"INVALID_INPUT",`${label} is required`);
  const normalized=value.trim();
  if(!normalized||normalized.length>max)throw new ApiError(400,"INVALID_INPUT",`${label} must be 1-${max} characters`);
  return normalized;
}
export function optionalText(value:unknown,label:string,max=200):string|null{
  if(value===undefined||value===null||value==="")return null;
  return text(value,label,max);
}
export function integer(value:unknown,label:string,min=0,max=Number.MAX_SAFE_INTEGER):number|null{
  if(value===null||value===undefined||value==="")return null;
  if(typeof value!=="number"||!Number.isInteger(value)||value<min||value>max)
    throw new ApiError(400,"INVALID_INPUT",`${label} must be an integer between ${min} and ${max}`);
  return value;
}
export function finiteNumber(value:unknown,label:string,min=-1_000_000,max=1_000_000):number|null{
  if(value===null||value===undefined||value==="")return null;
  if(typeof value!=="number"||!Number.isFinite(value)||value<min||value>max)
    throw new ApiError(400,"INVALID_INPUT",`${label} must be a finite number in range`);
  return value;
}
export function safeMetadata(value:unknown):Record<string,unknown>{
  if(value===undefined||value===null)return {};
  if(typeof value!=="object"||Array.isArray(value))throw new ApiError(400,"INVALID_INPUT","metadata must be an object");
  const json=JSON.stringify(value);
  if(json.length>20_000)throw new ApiError(400,"INVALID_INPUT","metadata is too large");
  return value as Record<string,unknown>;
}
export function bodyRows(value:unknown,maxRows=5_000):Record<string,unknown>[]{
  if(!Array.isArray(value)||value.length>maxRows)throw new ApiError(400,"INVALID_INPUT",`rows must be an array of at most ${maxRows} items`);
  return value.map((row,i)=>{
    if(!row||typeof row!=="object"||Array.isArray(row))throw new ApiError(400,"INVALID_INPUT",`rows[${i}] must be an object`);
    return row as Record<string,unknown>;
  });
}
export function requestId():string{return randomUUID();}
