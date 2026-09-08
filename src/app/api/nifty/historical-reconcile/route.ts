import {NextRequest,NextResponse} from "next/server";
import {connectNifty} from "@/src/lib/niftyMcp";
import {prisma} from "@/src/lib/prisma";

const norm=(s:any)=>String(s||"").trim().toLowerCase().replace(/[^a-z0-9.]+/g," ").replace(/\s+/g," ").trim();
const orderKey=(s:any)=>String(s||"").trim().toLowerCase().replace(/\.0$/," ").replace(/[^a-z0-9]/g,"");
const stop=new Set(["new","the","a","an","and","or","for","with","mens","men","womens","women","size","shoes","shoe","shirt","pants","jeans"]);
function tokens(s:any){return new Set(norm(s).split(" ").filter((x:string)=>x.length>1&&!stop.has(x)))}
function titleScore(a:any,b:any){const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let common=0;for(const x of A)if(B.has(x))common++;return common/Math.min(A.size,B.size)}
function titleAgrees(a:any,b:any){const na=norm(a),nb=norm(b);if(!na||!nb)return false;if(na===nb||na.includes(nb)||nb.includes(na))return true;return titleScore(a,b)>=0.72}
function sizes(s:any){const x=String(s||"").toLowerCase();const out=new Set<string>();for(const m of x.matchAll(/(?:size|sz)\s*(\d+(?:\.5)?)/g))out.add(m[1]);for(const m of x.matchAll(/\b(?:mens?|womens?|men|women)\s+(\d+(?:\.5)?)\b/g))out.add(m[1]);return out}
function sizeConflict(a:any,b:any){const A=sizes(a),B=sizes(b);if(!A.size||!B.size)return false;for(const x of A)if(B.has(x))return false;return true}
function gender(s:any){const x=String(s||"").toLowerCase();const m=/\b(?:women|womens|women's|female)\b/.test(x),f=/\b(?:men|mens|men's|male)\b/.test(x);return m&&!f?"W":f&&!m?"M":null}
function genderConflict(a:any,b:any){const A=gender(a),B=gender(b);return !!A&&!!B&&A!==B}
function strongTitleCandidates(inventory:any[],title:string){return inventory.map(i=>({i,score:titleScore(i.title,title)})).filter(x=>x.score>=0.86&&!sizeConflict(x.i.title,title)&&!genderConflict(x.i.title,title)).sort((a,b)=>b.score-a.score||a.i.id-b.i.id)}
function jsonFromResult(r:any){if(r?.structuredContent)return r.structuredContent;for(const c of r?.content||[])if(c?.type==="text")try{return JSON.parse(c.text)}catch{}return null}
function ordersFrom(v:any):any[]{if(Array.isArray(v))return v;for(const k of ["orders","results","items","data"])if(Array.isArray(v?.[k]))return v[k];return []}
function pick(o:any,...keys:string[]){for(const k of keys)if(o?.[k]!=null)return o[k]}
function linesFrom(o:any):any[]{for(const k of ["items","lineItems","line_items"])if(Array.isArray(o?.[k])&&o[k].length)return o[k];return [o]}
function platform(v:any){const s=norm(v).replace(/\s/g,"");return s==="ebay"?"EBAY":s==="poshmark"?"POSHMARK":s==="mercari"?"MERCARI":s==="depop"?"DEPOP":null}
function num(...v:any[]){for(const x of v){if(x===null||x===undefined||x==="")continue;const n=Number(x);if(Number.isFinite(n))return n}return null}

// READ ONLY. This endpoint never creates, updates, or deletes RH data.
export async function GET(req:NextRequest){let client:any=null;try{
 const connected=await connectNifty(req.nextUrl.origin);client=connected.client;if(connected.authorizationUrl)throw new Error("Nifty authorization required");
 const end=new Date(),start=new Date("2026-01-01T00:00:00.000Z"),orders:any[]=[];
 for(let page=0;page<30;page++){const r=await client.callTool({name:"search_orders",arguments:{startDate:start.toISOString().replace("Z",""),endDate:end.toISOString().replace("Z",""),sort:"sold_at",sortOrder:"desc",page,limit:50}});if(r?.isError)throw new Error(`Nifty search_orders error: ${JSON.stringify(r?.content||r).slice(0,1000)}`);const payload=jsonFromResult(r),batch=ordersFrom(payload);orders.push(...batch);if(payload?.hasMore===false||(payload?.hasMore==null&&batch.length<50))break}
 const newSales=await prisma.sale.findMany({where:{status:"NEW"},include:{lines:true},orderBy:{soldAt:"asc"}});
 const inventory=await prisma.inventoryItem.findMany({select:{id:true,sku:true,sourceSku:true,title:true,quantity:true,dispositionStatus:true,workflowStatus:true,unlisted:true,cogs:true}});
 const bySource=new Map<string,any[]>();for(const i of inventory){const k=norm(i.sourceSku);if(k)bySource.set(k,[...(bySource.get(k)||[]),i])}
 const byOrder=new Map<string,any[]>();for(const s of newSales){const k=orderKey(s.externalOrderId);if(k)byOrder.set(k,[...(byOrder.get(k)||[]),s])}
 const proposals:any[]=[],diagnostics:any[]=[];let rejectedTitle=0,rejectedSize=0,exactOrderIdHits=0,rejectedAmount=0,noSku=0,noInventoryForSku=0,duplicateInventoryForSku=0,uniqueInventoryForSku=0,titleFallbackUnique=0,titleFallbackAmbiguous=0,titleFallbackNone=0;
 for(const o of orders){const p=platform(pick(o,"marketplace","platform"));if(!p)continue;const soldAt=new Date(pick(o,"soldAt","sold_at")||0);if(!Number.isFinite(soldAt.getTime()))continue;const raw=linesFrom(o);if(raw.length!==1)continue;const line=raw[0],niftyTitle=String(pick(line,"title","itemTitle","item_title","name")||"");const external=String(pick(o,"externalMarketplaceOrderId","external_marketplace_order_id","externalOrderId","external_order_id","orderId","order_id")||"").trim();const exact=(byOrder.get(orderKey(external))||[]).filter((s:any)=>String(s.platform)===p);if(exact.length!==1)continue;exactOrderIdHits++;const sale=exact[0];
  if(sizeConflict(sale.lines?.[0]?.title,niftyTitle)){rejectedSize++;continue}if(!titleAgrees(sale.lines?.[0]?.title,niftyTitle)){rejectedTitle++;continue}
  const sku=String(pick(line,"sku","SKU")||pick(o,"sku","SKU")||"").trim();let candidates=sku?(bySource.get(norm(sku))||[]):[];let basis="EXACT_ORDER_ID_SKU_TITLE";
  if(!sku)noSku++;
  if(!candidates.length){if(sku)noInventoryForSku++;const fallback=strongTitleCandidates(inventory,niftyTitle);const best=fallback[0],second=fallback[1];const uniqueStrong=!!best&&(!second||best.score-second.score>=0.12)&&best.score>=0.9;if(uniqueStrong){candidates=[best.i];basis="EXACT_ORDER_ID_STRONG_TITLE_SIZE_GENDER";titleFallbackUnique++}else{if(fallback.length)titleFallbackAmbiguous++;else titleFallbackNone++;diagnostics.push({saleId:sale.id,external,reason:fallback.length?"TITLE_FALLBACK_AMBIGUOUS":"TITLE_FALLBACK_NONE",sourceSku:sku||null,saleTitle:sale.lines?.[0]?.title,niftyTitle,fallback:fallback.slice(0,6).map(x=>({id:x.i.id,sku:x.i.sku,sourceSku:x.i.sourceSku,title:x.i.title,quantity:x.i.quantity,status:x.i.dispositionStatus,score:x.score}))});continue}}
  if(candidates.length>1){duplicateInventoryForSku++;const viable=candidates.filter((i:any)=>!sizeConflict(i.title,niftyTitle)&&!genderConflict(i.title,niftyTitle)&&titleAgrees(i.title,niftyTitle));if(viable.length!==1){diagnostics.push({saleId:sale.id,external,reason:viable.length?"MULTIPLE_VIABLE_INVENTORY":"NO_VIABLE_INVENTORY",sourceSku:sku,saleTitle:sale.lines?.[0]?.title,niftyTitle,candidates:candidates.slice(0,8).map((i:any)=>({id:i.id,sku:i.sku,title:i.title,quantity:i.quantity,status:i.dispositionStatus,score:titleScore(i.title,niftyTitle),sizeConflict:sizeConflict(i.title,niftyTitle),genderConflict:genderConflict(i.title,niftyTitle)}))});continue}candidates=[viable[0]]}else if(basis==="EXACT_ORDER_ID_SKU_TITLE")uniqueInventoryForSku++;
  const inv=candidates[0];if(sizeConflict(inv.title,niftyTitle)||genderConflict(inv.title,niftyTitle)){rejectedSize++;continue}if(!titleAgrees(inv.title,niftyTitle)){rejectedTitle++;continue}
  const linePrice=num(pick(line,"salePrice","sale_price","price","saleAmount","sale_amount"));const orderAmount=num(pick(o,"salePrice","sale_price","saleAmount","sale_amount","subtotal","total"),linePrice),rhAmount=Number(sale.saleAmount),amountDelta=orderAmount==null?null:Math.abs(rhAmount-orderAmount);if(amountDelta!=null&&amountDelta>0.02){rejectedAmount++;continue}
  proposals.push({saleId:sale.id,matchBasis:basis,platform:p,soldAt:sale.soldAt,currentExternalOrderId:sale.externalOrderId,currentTitle:sale.lines?.[0]?.title||null,rhSaleAmount:rhAmount,niftySaleAmount:orderAmount,amountDelta,niftyExternalOrderId:external,items:[{sourceSku:sku||null,inventory:inv,title:niftyTitle,titleScoreSale:titleScore(sale.lines?.[0]?.title,niftyTitle),titleScoreInventory:titleScore(inv.title,niftyTitle)}]});
 }
 await client?.close().catch(()=>{});const unique=new Map<number,any>(),conflicts=new Set<number>();for(const x of proposals){if(unique.has(x.saleId))conflicts.add(x.saleId);else unique.set(x.saleId,x)}for(const id of conflicts)unique.delete(id);
 return NextResponse.json({ok:true,readOnly:true,niftyOrders:orders.length,newSales:newSales.length,newSalesWithExternalOrderId:newSales.filter((s:any)=>orderKey(s.externalOrderId)).length,exactOrderIdHits,safeUniqueProposals:unique.size,conflictsRemoved:conflicts.size,rejectedTitle,rejectedSize,rejectedAmount,noSku,noInventoryForSku,duplicateInventoryForSku,uniqueInventoryForSku,titleFallbackUnique,titleFallbackAmbiguous,titleFallbackNone,diagnostics:diagnostics.slice(0,100),proposals:[...unique.values()]});
}catch(e:any){await client?.close?.().catch(()=>{});return NextResponse.json({ok:false,error:String(e?.message||e)},{status:500})}}
