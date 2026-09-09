import {NextRequest,NextResponse} from "next/server";
import {connectNifty} from "@/src/lib/niftyMcp";
import {prisma} from "@/src/lib/prisma";

const norm=(s:any)=>String(s||"").trim().toLowerCase().replace(/[^a-z0-9.]+/g," ").replace(/\s+/g," ").trim();
const compact=(s:any)=>String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");
const orderKey=(s:any)=>String(s||"").trim().toLowerCase().replace(/\.0$/," ").replace(/[^a-z0-9]/g,"");
const stop=new Set(["new","the","a","an","and","or","for","with","mens","men","womens","women","size","sz"]);
function tokens(s:any){return new Set(norm(s).split(" ").filter((x:string)=>x.length>1&&!stop.has(x)))}
function titleScore(a:any,b:any){const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let common=0;for(const x of A)if(B.has(x))common++;return (2*common)/(A.size+B.size)}
function sizes(s:any){const x=String(s||"").toLowerCase();const out=new Set<string>();for(const m of x.matchAll(/(?:size|sz)\s*(\d+(?:\.5)?)/g))out.add(m[1]);for(const m of x.matchAll(/\b(?:mens?|womens?|men|women)\s+(\d+(?:\.5)?)\b/g))out.add(m[1]);return out}
function sizeConflict(a:any,b:any){const A=sizes(a),B=sizes(b);if(!A.size||!B.size)return false;for(const x of A)if(B.has(x))return false;return true}
function gender(s:any){const x=String(s||"").toLowerCase();const w=/\b(?:women|womens|women's|female)\b/.test(x),m=/\b(?:men|mens|men's|male)\b/.test(x);return w&&!m?"W":m&&!w?"M":null}
function genderConflict(a:any,b:any){const A=gender(a),B=gender(b);return !!A&&!!B&&A!==B}
const categoryRules:[string,RegExp][]=[
 ["SHOES",/\b(?:shoe|shoes|sneaker|sneakers|loafer|loafers|boot|boots|sandal|sandals|clog|clogs|slide|slides)\b/i],
 ["PANTS",/\b(?:pants|trouser|trousers|jeans|chino|chinos|khaki|khakis|jogger|joggers|leggings)\b/i],
 ["SHORTS",/\bshorts\b/i],["SHIRT",/\b(?:shirt|shirts|polo shirt|polo shirts|tee|tshirt|henley)\b/i],
 ["JACKET",/\b(?:jacket|jackets|coat|coats|blazer|blazers)\b/i],["SWEATER",/\b(?:sweater|sweaters|pullover|pullovers|hoodie|hoodies|sweatshirt|sweatshirts|fleece)\b/i],
 ["DRESS",/\b(?:dress|dresses|gown|gowns)\b/i],["SKIRT",/\b(?:skirt|skirts)\b/i],["BAG",/\b(?:bag|bags|purse|purses|handbag|handbags|backpack|backpacks)\b/i]
];
function categories(s:any){const x=norm(s);return new Set(categoryRules.filter(([,r])=>r.test(x)).map(([k])=>k))}
function categoryConflict(a:any,b:any){const A=categories(a),B=categories(b);if(!A.size||!B.size)return false;for(const x of A)if(B.has(x))return false;return true}
function jsonFromResult(r:any){if(r?.structuredContent)return r.structuredContent;for(const c of r?.content||[])if(c?.type==="text")try{return JSON.parse(c.text)}catch{}return null}
function ordersFrom(v:any):any[]{if(Array.isArray(v))return v;for(const k of ["orders","results","items","data"])if(Array.isArray(v?.[k]))return v[k];return []}
function pick(o:any,...keys:string[]){for(const k of keys)if(o?.[k]!=null)return o[k]}
function linesFrom(o:any):any[]{for(const k of ["items","lineItems","line_items"])if(Array.isArray(o?.[k])&&o[k].length)return o[k];return [o]}
function platform(v:any){const s=norm(v).replace(/\s/g,"");return s==="ebay"?"EBAY":s==="poshmark"?"POSHMARK":s==="mercari"?"MERCARI":s==="depop"?"DEPOP":null}
function num(...v:any[]){for(const x of v){if(x===null||x===undefined||x==="")continue;const n=Number(x);if(Number.isFinite(n))return n}return null}
function monthWindows(){const out:{start:Date,end:Date,label:string}[]=[];const now=new Date();for(let m=0;m<=now.getUTCMonth();m++){const start=new Date(Date.UTC(2026,m,1));const end=new Date(Math.min(Date.UTC(2026,m+1,1)-1,now.getTime()));out.push({start,end,label:`2026-${String(m+1).padStart(2,"0")}`})}return out}
function niftyOrderIdentity(o:any){const p=platform(pick(o,"marketplace","platform"))||"?";const ext=orderKey(pick(o,"externalMarketplaceOrderId","external_marketplace_order_id","externalOrderId","external_order_id","orderId","order_id"));const id=String(pick(o,"id","orderUuid","order_uuid")||"");const sold=String(pick(o,"soldAt","sold_at")||"");return ext?`${p}:${ext}`:id?`id:${id}`:`${p}:${sold}:${norm(linesFrom(o)[0]?.title)}`}

const storeAliases:[string,string[]][]=[
 ["savers",["savers","saver"]],["goodwill",["goodwill","goodwill ah"]],["kohls",["kohls","kohl s","kohl's"]],
 ["foot locker",["foot locker","footlocker"]],["champs",["champs"]],["platos",["platos","plato s","plato's"]],
 ["nordstrom rack",["rack","nordstrom rack","nordstromrack"]],["bins",["bins","goodwill bins"]],["kim",["kim"]],
 ["basement",["basement"]],["woot",["woot"]],["fanatics",["fanatics"]],["wrangler",["wrangler"]],["wolfs",["wolfs","wolf s"]],
 ["jcpenney",["jcpenney","jc penny","jcpenny","jcp"]]
];
function storeKey(v:any){const n=norm(v);if(!n)return null;for(const [key,aliases] of storeAliases)if(aliases.some(a=>n.includes(norm(a))))return key;return n.replace(/\b(?:hoffman estates|arlington heights|ah)\b/g,"").replace(/\s+/g," ").trim()||n}
function parseDateToken(raw:string){const s=String(raw||"").trim();let m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);if(m){let y=Number(m[3]);if(y<100)y+=2000;const d=new Date(Date.UTC(y,Number(m[1])-1,Number(m[2])));return Number.isFinite(d.getTime())?d:null}m=s.match(/^(\d{2})(\d{2})(\d{2})$/);if(m){const d=new Date(Date.UTC(2000+Number(m[3]),Number(m[1])-1,Number(m[2])));return Number.isFinite(d.getTime())?d:null}return null}
function dayKey(v:any){if(!v)return null;const d=v instanceof Date?v:new Date(v);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):null}
function moneyEq(a:any,b:any,tol=.02){const A=Number(a),B=Number(b);return Number.isFinite(A)&&Number.isFinite(B)&&Math.abs(A-B)<=tol}
function parseSku(rawSku:string,lineCogs:any){const raw=String(rawSku||"").trim(),parts=raw.replace(/\$/g," ").split(/[\s-]+/).filter(Boolean);let date:Date|null=null;let dateToken="";for(const p of parts){const d=parseDateToken(p);if(d){date=d;dateToken=p;break}}
 const cogs=num(lineCogs);let cost:number|null=null;let costToken="";const numeric=parts.map(p=>({p,n:Number(p.replace(/,/g,""))})).filter(x=>Number.isFinite(x.n));if(cogs!=null){const hit=numeric.find(x=>Math.abs(x.n-cogs)<=.02&&x.p!==dateToken);if(hit){cost=hit.n;costToken=hit.p}}if(cost==null&&cogs!=null)cost=cogs;
 let store:string|null=null;const n=norm(raw);for(const [key,aliases] of storeAliases){if(aliases.some(a=>n.includes(norm(a)))){store=key;break}}
 const refs=parts.filter(p=>/^\d{3,5}$/.test(p)&&p!==dateToken&&p!==costToken&&!parseDateToken(p)).map(p=>String(Number(p)));
 return {raw,normalized:compact(raw),date:dayKey(date),store,cost,refs:[...new Set(refs)]};
}
function referenceTokens(v:any){return String(v||"").split(/[^0-9]+/).filter(x=>/^\d{3,5}$/.test(x)).map(x=>String(Number(x)))}
function metadataScore(inv:any,parsed:any,niftyTitle:string){let score=0;const reasons:string[]=[];const invStore=storeKey(inv.purchaseStore),invDate=dayKey(inv.purchaseDate),invCost=num(inv.cogs);if(parsed.date&&invDate===parsed.date){score+=4;reasons.push("date")}if(parsed.store&&invStore===parsed.store){score+=4;reasons.push("store")}if(parsed.cost!=null&&moneyEq(invCost,parsed.cost)){score+=4;reasons.push("cost")}
 const invRefs=new Set([...referenceTokens(inv.sourceSku),...referenceTokens(inv.sku)]);const refHit=parsed.refs.some((r:string)=>invRefs.has(r));if(refHit){score+=5;reasons.push("reference")}
 const t=titleScore(inv.title,niftyTitle);if(t>=.65){score+=2;reasons.push("title")}else if(t>=.35){score+=1;reasons.push("title_weak")}
 if(sizeConflict(inv.title,niftyTitle)){score-=4;reasons.push("size_conflict")}if(genderConflict(inv.title,niftyTitle)){score-=3;reasons.push("gender_conflict")}if(categoryConflict(inv.title,niftyTitle)){score-=3;reasons.push("category_conflict")}
 return {score,reasons,titleScore:t,invStore,invDate,invCost,refHit};
}
function saleLineScore(sale:any,line:any,order:any){const saleLine=sale.lines?.[0];const niftyTitle=String(pick(line,"title","itemTitle","item_title","name")||"");let score=0;const reasons:string[]=[];const external=orderKey(pick(order,"externalMarketplaceOrderId","external_marketplace_order_id","externalOrderId","external_order_id","orderId","order_id"));if(external&&orderKey(sale.externalOrderId)===external){score+=10;reasons.push("order_id")}
 const soldA=dayKey(sale.soldAt),soldB=dayKey(pick(order,"soldAt","sold_at"));if(soldA&&soldA===soldB){score+=3;reasons.push("sold_date")}
 const t=titleScore(saleLine?.title,niftyTitle);if(t>=.72){score+=4;reasons.push("title")}else if(t>=.4){score+=2;reasons.push("title_weak")}
 const linePrice=num(pick(line,"salePrice","sale_price","price","saleAmount","sale_amount")),orderPrice=num(pick(order,"salePrice","sale_price","saleAmount","sale_amount","subtotal","total"));if((linePrice!=null&&moneyEq(sale.saleAmount,linePrice))||(orderPrice!=null&&moneyEq(sale.saleAmount,orderPrice))){score+=2;reasons.push("amount")}
 if(sizeConflict(saleLine?.title,niftyTitle))score-=5;if(genderConflict(saleLine?.title,niftyTitle))score-=4;if(categoryConflict(saleLine?.title,niftyTitle))score-=4;return {score,reasons,titleScore:t};
}
function candidateView(x:any){return {id:x.i.id,sku:x.i.sku,sourceSku:x.i.sourceSku,title:x.i.title,quantity:x.i.quantity,status:x.i.dispositionStatus,workflowStatus:x.i.workflowStatus,unlisted:x.i.unlisted,cogs:x.i.cogs,purchaseStore:x.i.purchaseStore,purchaseDate:x.i.purchaseDate,score:x.score,reasons:x.reasons,titleScore:x.titleScore}}

// READ ONLY. This endpoint never creates, updates, deletes, links, unlinks, or changes RH data.
export async function GET(req:NextRequest){let client:any=null;try{
 const connected=await connectNifty(req.nextUrl.origin);client=connected.client;if(connected.authorizationUrl)throw new Error("Nifty authorization required");
 const orderMap=new Map<string,any>(),windowStats:any[]=[];
 for(const w of monthWindows()){let raw=0,pages=0;for(let page=0;page<30;page++){const r=await client.callTool({name:"search_orders",arguments:{startDate:w.start.toISOString().replace("Z",""),endDate:w.end.toISOString().replace("Z",""),sort:"sold_at",sortOrder:"desc",page,limit:50}});if(r?.isError)throw new Error(`Nifty search_orders ${w.label} error: ${JSON.stringify(r?.content||r).slice(0,1000)}`);const payload=jsonFromResult(r),batch=ordersFrom(payload);pages++;raw+=batch.length;for(const o of batch)orderMap.set(niftyOrderIdentity(o),o);if(payload?.hasMore===false||(payload?.hasMore==null&&batch.length<50))break}windowStats.push({month:w.label,pages,rawOrders:raw})}
 const orders=[...orderMap.values()];
 const newSales=await prisma.sale.findMany({where:{status:"NEW"},include:{lines:true},orderBy:{soldAt:"asc"}});
 const inventory=await prisma.inventoryItem.findMany({select:{id:true,sku:true,sourceSku:true,title:true,quantity:true,dispositionStatus:true,workflowStatus:true,unlisted:true,cogs:true,purchaseStore:true,purchaseDate:true}});
 const byNormalizedSource=new Map<string,any[]>();for(const i of inventory){const k=compact(i.sourceSku);if(k)byNormalizedSource.set(k,[...(byNormalizedSource.get(k)||[]),i])}
 const results:any[]=[],safeLineMatches:any[]=[];const stats={orders:orders.length,orderLines:0,cancelledLines:0,noSku:0,salesAnchored:0,salesAmbiguous:0,salesMissing:0,exactSourceUnique:0,exactSourceMultiple:0,metadataUnique:0,metadataAmbiguous:0,noInventoryCandidate:0};
 for(const o of orders){const p=platform(pick(o,"marketplace","platform"));if(!p)continue;const status=String(pick(o,"status")||"").toUpperCase();const lines=linesFrom(o);for(let lineIndex=0;lineIndex<lines.length;lineIndex++){const line=lines[lineIndex];stats.orderLines++;if(status==="CANCELLED"||String(pick(line,"status")||"").toUpperCase()==="CANCELLED"){stats.cancelledLines++;continue}
  const niftyTitle=String(pick(line,"title","itemTitle","item_title","name")||"");const sku=String(pick(line,"sku","SKU")||pick(o,"sku","SKU")||"").trim();if(!sku)stats.noSku++;const parsed=parseSku(sku,pick(line,"cogs","cost","costOfGoods"));
  const saleRanks=newSales.filter((s:any)=>String(s.platform)===p).map((s:any)=>({sale:s,...saleLineScore(s,line,o)})).filter((x:any)=>x.score>=5).sort((a:any,b:any)=>b.score-a.score||a.sale.id-b.sale.id);const topSale=saleRanks[0],secondSale=saleRanks[1];const anchoredSale=topSale&&(!secondSale||topSale.score-secondSale.score>=2)?topSale.sale:null;if(anchoredSale)stats.salesAnchored++;else if(saleRanks.length)stats.salesAmbiguous++;else stats.salesMissing++;
  const exact=sku?(byNormalizedSource.get(parsed.normalized)||[]):[];let classification="NO_INVENTORY_CANDIDATE",chosen:any=null,candidates:any[]=[];
  if(exact.length===1){classification="EXACT_SOURCE_SKU_UNIQUE";chosen=exact[0];stats.exactSourceUnique++;candidates=[{i:chosen,score:99,reasons:["exact_source_sku"],titleScore:titleScore(chosen.title,niftyTitle)}]}
  else if(exact.length>1){classification="EXACT_SOURCE_SKU_MULTIPLE_UNITS";stats.exactSourceMultiple++;candidates=exact.map(i=>({i,score:99,reasons:["exact_source_sku","multiple_physical_rows_possible"],titleScore:titleScore(i.title,niftyTitle)}))}
  else {const ranked=inventory.map(i=>({i,...metadataScore(i,parsed,niftyTitle)})).filter((x:any)=>x.score>=8).sort((a:any,b:any)=>b.score-a.score||a.i.id-b.i.id);candidates=ranked.slice(0,10);const best=ranked[0],second=ranked[1];if(best&&best.score>=10&&(!second||best.score-second.score>=3)){classification="PURCHASE_METADATA_UNIQUE";chosen=best.i;stats.metadataUnique++}else if(ranked.length){classification="PURCHASE_METADATA_AMBIGUOUS";stats.metadataAmbiguous++}else stats.noInventoryCandidate++}
  const result={platform:p,orderStatus:status||null,niftyOrderId:pick(o,"id","orderUuid","order_uuid")||null,externalOrderId:pick(o,"externalMarketplaceOrderId","external_marketplace_order_id","externalOrderId","external_order_id","orderId","order_id")||null,soldAt:pick(o,"soldAt","sold_at")||null,lineIndex,lineCount:lines.length,niftyTitle,sku:sku||null,parsedSku:parsed,saleAnchor:anchoredSale?{saleId:anchoredSale.id,title:anchoredSale.lines?.[0]?.title||null,amount:anchoredSale.saleAmount,soldAt:anchoredSale.soldAt}:null,saleCandidates:saleRanks.slice(0,4).map((x:any)=>({saleId:x.sale.id,score:x.score,reasons:x.reasons,title:x.sale.lines?.[0]?.title||null,amount:x.sale.saleAmount,soldAt:x.sale.soldAt})),classification,chosenInventoryId:chosen?.id||null,candidates:candidates.map(candidateView)};results.push(result);
  if(anchoredSale&&chosen&&(classification==="EXACT_SOURCE_SKU_UNIQUE"||classification==="PURCHASE_METADATA_UNIQUE"))safeLineMatches.push(result);
 }}
 await client?.close().catch(()=>{});
 return NextResponse.json({ok:true,readOnly:true,scanMode:"MONTHLY_2026_EXCEL_ROW_METADATA_V2",rules:{physicalUnitModel:"Historical Excel quantity was represented by separate rows; repeated matching rows are preserved as possible separate units.",cancelledOrders:"Ignored for inventory consumption.",titleRole:"Supporting evidence only; purchase metadata and custom SKU outrank listing title."},windowStats,newSales:newSales.length,inventoryItems:inventory.length,stats,safeLineMatches:safeLineMatches.slice(0,250),review:results.filter((x:any)=>!safeLineMatches.includes(x)).slice(0,250)});
}catch(e:any){await client?.close?.().catch(()=>{});return NextResponse.json({ok:false,error:String(e?.message||e)},{status:500})}}
