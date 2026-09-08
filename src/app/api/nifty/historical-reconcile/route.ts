import {NextRequest,NextResponse} from "next/server";
import {connectNifty} from "@/src/lib/niftyMcp";
import {prisma} from "@/src/lib/prisma";

const norm=(s:any)=>String(s||"").trim().toLowerCase().replace(/[^a-z0-9.]+/g," ").replace(/\s+/g," ").trim();
const stop=new Set(["new","the","a","an","and","or","for","with","mens","men","womens","women","size","shoes","shoe","shirt","pants","jeans"]);
function tokens(s:any){return new Set(norm(s).split(" ").filter((x:string)=>x.length>1&&!stop.has(x)))}
function titleScore(a:any,b:any){const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let common=0;for(const x of A)if(B.has(x))common++;return common/Math.min(A.size,B.size)}
function titleAgrees(a:any,b:any){const na=norm(a),nb=norm(b);if(!na||!nb)return false;if(na===nb||na.includes(nb)||nb.includes(na))return true;return titleScore(a,b)>=0.72}
function sizes(s:any){const x=String(s||"").toLowerCase();const out=new Set<string>();for(const m of x.matchAll(/(?:size|sz)\s*(\d+(?:\.5)?)/g))out.add(m[1]);for(const m of x.matchAll(/\b(?:mens?|womens?|men|women)\s+(\d+(?:\.5)?)\b/g))out.add(m[1]);return out}
function sizeConflict(a:any,b:any){const A=sizes(a),B=sizes(b);if(!A.size||!B.size)return false;for(const x of A)if(B.has(x))return false;return true}
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
    const proposals:any[]=[];let rejectedTitle=0,rejectedSize=0;
    for(const o of orders){
      const p=platform(pick(o,"marketplace","platform"));if(!p)continue;
      const soldAt=new Date(pick(o,"soldAt","sold_at")||0);if(!Number.isFinite(soldAt.getTime()))continue;
      const raw=linesFrom(o);if(raw.length!==1)continue;
      const niftyTitle=String(pick(raw[0],"title","itemTitle","item_title","name")||"");
      const timeNear=newSales.filter((s:any)=>String(s.platform)===p&&Math.abs(new Date(s.soldAt).getTime()-soldAt.getTime())<=15*60*1000);
      const near=timeNear.filter((s:any)=>titleAgrees(s.lines?.[0]?.title,niftyTitle)&&!sizeConflict(s.lines?.[0]?.title,niftyTitle));
      if(near.length!==1){if(timeNear.length)rejectedTitle++;continue}
      const sku=String(pick(raw[0],"sku","SKU")||pick(o,"sku","SKU")||"").trim();const candidates=bySource.get(norm(sku))||[];
      if(!sku||candidates.length!==1)continue;
      const inv=candidates[0];
      if(sizeConflict(inv.title,niftyTitle)){rejectedSize++;continue}
      if(!titleAgrees(inv.title,niftyTitle)){rejectedTitle++;continue}
      proposals.push({saleId:near[0].id,platform:p,soldAt:near[0].soldAt,currentTitle:near[0].lines?.[0]?.title||null,niftyExternalOrderId:String(pick(o,"externalMarketplaceOrderId","external_marketplace_order_id","externalOrderId","external_order_id")||""),items:[{sourceSku:sku,inventory:inv,title:niftyTitle,titleScoreSale:titleScore(near[0].lines?.[0]?.title,niftyTitle),titleScoreInventory:titleScore(inv.title,niftyTitle)}]});
    }
    await client?.close().catch(()=>{});
    const unique=new Map<number,any>();const conflicts=new Set<number>();for(const x of proposals){if(unique.has(x.saleId))conflicts.add(x.saleId);else unique.set(x.saleId,x)}for(const id of conflicts)unique.delete(id);
    return NextResponse.json({ok:true,readOnly:true,niftyOrders:orders.length,newSales:newSales.length,safeUniqueProposals:unique.size,conflictsRemoved:conflicts.size,rejectedTitle,rejectedSize,proposals:[...unique.values()]});
  }catch(e:any){await client?.close?.().catch(()=>{});return NextResponse.json({ok:false,error:String(e?.message||e)},{status:500})}
}
