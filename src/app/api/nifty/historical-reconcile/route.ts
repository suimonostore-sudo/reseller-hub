import {NextRequest,NextResponse} from "next/server";
import {connectNifty} from "@/src/lib/niftyMcp";
import {prisma} from "@/src/lib/prisma";

const norm=(s:any)=>String(s||"").trim().toLowerCase().replace(/\s+/g," ");
function jsonFromResult(r:any){if(r?.structuredContent)return r.structuredContent;for(const c of r?.content||[])if(c?.type==="text")try{return JSON.parse(c.text)}catch{}return null}
function ordersFrom(v:any):any[]{if(Array.isArray(v))return v;for(const k of ["orders","results","items","data"])if(Array.isArray(v?.[k]))return v[k];return []}
function pick(o:any,...keys:string[]){for(const k of keys)if(o?.[k]!=null)return o[k]}
function linesFrom(o:any):any[]{for(const k of ["items","lineItems","line_items"])if(Array.isArray(o?.[k])&&o[k].length)return o[k];return [o]}
function platform(v:any){const s=norm(v).replace(/\s/g,"");return s==="ebay"?"EBAY":s==="poshmark"?"POSHMARK":s==="mercari"?"MERCARI":s==="depop"?"DEPOP":null}

// READ ONLY. This endpoint never creates, updates, or deletes RH data.
export async function GET(req:NextRequest){
  let client:any=null;
  try{
    const connected=await connectNifty(req.nextUrl.origin);client=connected.client;
    if(connected.authorizationUrl)throw new Error("Nifty authorization required");
    const end=new Date();const start=new Date("2026-01-01T00:00:00.000Z");
    const orders:any[]=[];
    for(let page=0;page<30;page++){
      const r=await client.callTool({name:"search_orders",arguments:{startDate:start.toISOString().replace("Z",""),endDate:end.toISOString().replace("Z",""),sort:"sold_at",sortOrder:"desc",page,limit:50}});
      if(r?.isError)throw new Error(`Nifty search_orders error: ${JSON.stringify(r?.content||r).slice(0,1000)}`);
      const payload=jsonFromResult(r),batch=ordersFrom(payload);orders.push(...batch);
      if(payload?.hasMore===false||(payload?.hasMore==null&&batch.length<50))break;
    }
    const newSales=await prisma.sale.findMany({where:{status:"NEW"},include:{lines:true},orderBy:{soldAt:"asc"}});
    const inventory=await prisma.inventoryItem.findMany({select:{id:true,sku:true,sourceSku:true,title:true,quantity:true,dispositionStatus:true}});
    const bySource=new Map<string,any[]>();for(const i of inventory){const k=norm(i.sourceSku);if(!k)continue;bySource.set(k,[...(bySource.get(k)||[]),i])}
    const proposals:any[]=[];
    for(const o of orders){
      const p=platform(pick(o,"marketplace","platform"));if(!p)continue;
      const soldAt=new Date(pick(o,"soldAt","sold_at")||0);if(!Number.isFinite(soldAt.getTime()))continue;
      const near=newSales.filter((s:any)=>String(s.platform)===p&&Math.abs(new Date(s.soldAt).getTime()-soldAt.getTime())<=15*60*1000);
      if(near.length!==1)continue;
      const raw=linesFrom(o);const itemMatches:any[]=[];let safe=true;
      for(const l of raw){const sku=String(pick(l,"sku","SKU")||pick(o,"sku","SKU")||"").trim();const candidates=bySource.get(norm(sku))||[];if(!sku||candidates.length!==1){safe=false;break}itemMatches.push({sourceSku:sku,inventory:candidates[0],title:String(pick(l,"title","itemTitle","item_title","name")||"")})}
      if(!safe||!itemMatches.length)continue;
      proposals.push({saleId:near[0].id,platform:p,soldAt:near[0].soldAt,currentTitle:near[0].lines?.[0]?.title||null,niftyExternalOrderId:String(pick(o,"externalMarketplaceOrderId","external_marketplace_order_id","externalOrderId","external_order_id")||""),items:itemMatches});
    }
    await client?.close().catch(()=>{});
    const unique=new Map<number,any>();const conflicts=new Set<number>();for(const x of proposals){if(unique.has(x.saleId))conflicts.add(x.saleId);else unique.set(x.saleId,x)}for(const id of conflicts)unique.delete(id);
    return NextResponse.json({ok:true,readOnly:true,niftyOrders:orders.length,newSales:newSales.length,safeUniqueProposals:unique.size,conflictsRemoved:conflicts.size,proposals:[...unique.values()]});
  }catch(e:any){await client?.close?.().catch(()=>{});return NextResponse.json({ok:false,error:String(e?.message||e)},{status:500})}
}
