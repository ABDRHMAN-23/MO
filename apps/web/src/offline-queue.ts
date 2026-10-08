const KEY="spatial.pending.placement-moves.v1";

export interface PendingPlacementMove{
  id:string;
  placementId:string;
  productId:string;
  spatialNodeId:string;
  expectedUpdatedAt:string;
  reason?:string;
  createdAt:string;
  attempts:number;
}

function read():PendingPlacementMove[]{
  try{
    const raw=localStorage.getItem(KEY);
    if(!raw)return [];
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed))return [];
    return parsed.filter((item):item is PendingPlacementMove =>
      Boolean(item) &&
      typeof item==="object" &&
      typeof item.id==="string" &&
      typeof item.placementId==="string" &&
      typeof item.productId==="string" &&
      typeof item.spatialNodeId==="string" &&
      typeof item.expectedUpdatedAt==="string" &&
      typeof item.createdAt==="string" &&
      typeof item.attempts==="number"
    );
  }catch{
    return [];
  }
}

function write(items:PendingPlacementMove[]):void{
  localStorage.setItem(KEY,JSON.stringify(items.slice(-100)));
}

function uid():string{
  if(typeof crypto!=="undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `move-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function listPendingMoves():PendingPlacementMove[]{return read();}

export function enqueuePendingMove(input:Omit<PendingPlacementMove,"id"|"createdAt"|"attempts">):PendingPlacementMove{
  const item:PendingPlacementMove={...input,id:uid(),createdAt:new Date().toISOString(),attempts:0};
  const next=read().filter((current)=>current.placementId!==item.placementId);
  next.push(item);
  write(next);
  return item;
}

export function removePendingMove(id:string):void{
  write(read().filter((item)=>item.id!==id));
}

function bump(item:PendingPlacementMove):void{
  write(read().map((current)=>current.id===item.id?{...current,attempts:current.attempts+1}:current));
}

export async function flushPendingMoves(
  move:(item:PendingPlacementMove)=>Promise<void>
):Promise<{completed:number;conflicts:number;failures:number}>{
  let completed=0,conflicts=0,failures=0;
  for(const item of read()){
    try{
      await move(item);
      removePendingMove(item.id);
      completed++;
    }catch(error){
      bump(item);
      if(error&&typeof error==="object"&&"status" in error&&Number((error as {status?:unknown}).status)===409){
        conflicts++;
        break;
      }
      failures++;
    }
  }
  return {completed,conflicts,failures};
}
