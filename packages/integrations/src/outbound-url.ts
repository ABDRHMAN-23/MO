import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function allowedHosts():Set<string>{
  return new Set((process.env.INTEGRATION_ALLOWED_HOSTS ?? "").split(",").map((value)=>value.trim().toLowerCase()).filter(Boolean));
}

function privateIpv4(address:string):boolean{
  const parts=address.split(".").map(Number);
  if(parts.length!==4||parts.some((part)=>!Number.isInteger(part)||part<0||part>255))return true;
  const [a,b]=parts;
  if(a===0||a===10||a===127||a>=224)return true;
  if(a===169&&b===254)return true;
  if(a===172&&b>=16&&b<=31)return true;
  if(a===192&&b===168)return true;
  if(a===100&&b>=64&&b<=127)return true;
  if(a===192&&b===0)return true;
  if(a===198&&(b===18||b===19))return true;
  return false;
}

function privateIpv6(address:string):boolean{
  const normalized=address.toLowerCase();
  if(normalized==="::"||normalized==="::1")return true;
  const first=parseInt(normalized.split(":")[0]||"0",16);
  if(!Number.isFinite(first))return true;
  if((first&0xfe00)===0xfc00)return true;
  if((first&0xffc0)===0xfe80)return true;
  if((first&0xff00)===0xff00)return true;
  return false;
}

export function isPrivateAddress(address:string):boolean{
  const family=isIP(address);
  return family===4 ? privateIpv4(address) : family===6 ? privateIpv6(address) : true;
}

export async function assertSafeOutboundUrl(raw:string):Promise<URL>{
  let parsed:URL;
  try{parsed=new URL(raw);}catch{throw new Error("Outbound URL is invalid");}
  if(parsed.protocol!=="https:")throw new Error("Outbound integration URL must use HTTPS");
  if(parsed.username||parsed.password)throw new Error("Outbound URL must not contain credentials");

  const hostname=parsed.hostname.toLowerCase().replace(/^\[|\]$/g,"");
  if(allowedHosts().has(hostname))return parsed;

  if(isIP(hostname)){
    if(isPrivateAddress(hostname))throw new Error("Outbound integration URL resolves to a private or local address");
    return parsed;
  }

  let addresses;
  try{addresses=await lookup(hostname,{all:true,verbatim:true});}
  catch{throw new Error("Outbound integration hostname could not be resolved");}
  if(!addresses.length)throw new Error("Outbound integration hostname has no address");
  if(addresses.some((entry)=>isPrivateAddress(entry.address))){
    throw new Error("Outbound integration hostname resolves to a private or local address");
  }
  return parsed;
}
