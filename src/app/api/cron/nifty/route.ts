import {NextRequest,NextResponse} from "next/server";

export async function GET(req:NextRequest){
  if(process.env.CRON_SECRET&&req.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({error:"Unauthorized"},{status:401});
  try{
    const origin=req.nextUrl.origin;
    const r=await fetch(`${origin}/api/nifty/sync`,{method:"POST",headers:{"content-type":"application/json"},cache:"no-store"});
    const body=await r.json().catch(()=>({}));
    return NextResponse.json(body,{status:r.status});
  }catch(e:any){
    return NextResponse.json({error:String(e?.message||e)},{status:500});
  }
}
