type Bucket={count:number;resetAt:number};

export class RateLimiter {
  private readonly buckets=new Map<string,Bucket>();
  constructor(private readonly limit:number,private readonly windowMs:number){}
  check(key:string):{allowed:boolean;retryAfterSeconds:number}{
    const now=Date.now();
    const current=this.buckets.get(key);
    if(!current||current.resetAt<=now){
      this.buckets.set(key,{count:1,resetAt:now+this.windowMs});
      this.gc(now);
      return {allowed:true,retryAfterSeconds:0};
    }
    if(current.count>=this.limit){
      return {allowed:false,retryAfterSeconds:Math.ceil((current.resetAt-now)/1000)};
    }
    current.count+=1;
    return {allowed:true,retryAfterSeconds:0};
  }
  private gc(now:number){
    if(this.buckets.size<1000)return;
    for(const [key,value] of this.buckets)if(value.resetAt<=now)this.buckets.delete(key);
  }
}
