import {NextRequest,NextResponse} from "next/server";
import {inflateRawSync} from "zlib";
import {createHash} from "crypto";
import {prisma} from "@/src/lib/prisma";
import {Platform,SaleStatus} from "@prisma/client";

type Row={p?:string;m?:string;sd?:string;a?:number;f?:number;sh?:number;q?:number;c?:number;ps?:string;pd?:string;cs?:string;li?:string;eb?:string;ord?:string};
const clean=(v:any)=>String(v??"").trim();
const norm=(v:any)=>clean(v).toLowerCase().replace(/[^a-z0-9.]+/g," ").trim().replace(/\s+/g," ");
const money=(v:any)=>v==null||v===""?0:Number(v)||0;
const day=(v:any)=>clean(v).slice(0,10);
const platformOf=(v:any):Platform|null=>{const s=clean(v).toLowerCase();if(s==="ebay")return Platform.EBAY;if(s==="poshmark")return Platform.POSHMARK;if(s==="mercari")return Platform.MERCARI;if(s==="depop")return Platform.DEPOP;return null};
const keyFor=(r:Row,p:Platform)=>"FLIPWISE|"+createHash("sha1").update([p,r.ord,r.li,r.eb,r.p,r.sd,r.a,r.cs].map(clean).join("|")).digest("hex");

export async function GET(req:NextRequest){
 try{
  const d=req.nextUrl.searchParams.get("d");
  if(!d)return NextResponse.json({error:"Missing data"},{status:400});
  const rows:Row[]=JSON.parse(inflateRawSync(Buffer.from(d,"base64url")).toString("utf8"));
  if(!Array.isArray(rows)||rows.length>100)return NextResponse.json({error:"Invalid batch"},{status:400});

  const inventory=await prisma.inventoryItem.findMany({select:{id:true,sku:true,sourceSku:true,title:true,cogs:true,quantity:true,dispositionStatus:true,purchaseDate:true,purchaseStore:true,listings:{select:{platform:true,externalId:true}}}});
  const byListing=new Map<string,number[]>(),bySource=new Map<string,number[]>(),byTitle=new Map<string,number[]>(),byTitleDateCost=new Map<string,number[]>();
  const add=(m:Map<string,number[]>,k:string,id:number)=>{if(!k)return;const a=m.get(k)||[];if(!a.includes(id))a.push(id);m.set(k,a)};
  for(const i of inventory){
   add(bySource,clean(i.sku),i.id);add(bySource,clean(i.sourceSku),i.id);add(byTitle,norm(i.title),i.id);
   for(const l of i.listings||[])add(byListing,`${l.platform}|${clean(l.externalId)}`,i.id);
   const t=norm(i.title),pd=day(i.purchaseDate?.toISOString()),c=i.cogs==null?"":Number(i.cogs).toFixed(2);if(t&&pd&&c)add(byTitleDateCost,`${t}|${pd}|${c}`,i.id);
  }
  const itemById=new Map(inventory.map(i=>[i.id,i]));

  let imported=0,deduped=0,matched=0,unmatched=0,ambiguous=0,failed=0;const details:any[]=[];
  for(const r of rows){
   try{
    const platform=platformOf(r.m);if(!platform){failed++;details.push({product:r.p,error:`Unsupported marketplace ${r.m}`});continue}
    const title=clean(r.p)||"Untitled Flipwise sale",amount=money(r.a),fees=money(r.f),shipping=money(r.sh),qty=Math.max(1,Number(r.q||1)||1),soldAt=new Date(clean(r.sd));
    if(Number.isNaN(soldAt.getTime())){failed++;details.push({product:r.p,error:"Invalid sold date"});continue}
    const ingestionKey=keyFor(r,platform);
    let existing=await prisma.sale.findUnique({where:{ingestionKey},select:{id:true}});
    if(!existing&&platform===Platform.EBAY&&clean(r.ord))existing=await prisma.sale.findFirst({where:{platform,externalOrderId:clean(r.ord)},select:{id:true}});
    if(!existing){const from=new Date(soldAt.getTime()-36*60*60*1000),to=new Date(soldAt.getTime()+36*60*60*1000);const candidates=await prisma.sale.findMany({where:{platform,saleAmount:{gte:amount-.005,lte:amount+.005},soldAt:{gte:from,lte:to}},select:{id:true,lines:{select:{title:true}}}});existing=candidates.find(s=>s.lines.some(l=>norm(l.title)===norm(title)))||null}
    if(existing){deduped++;continue}

    const hits=new Set<number>();const eb=clean(r.eb),cs=clean(r.cs),t=norm(title),pd=day(r.pd),cost=money(r.c);
    const collect=(a?:number[])=>{for(const id of a||[])hits.add(id)};
    if(eb)collect(byListing.get(`${platform}|${eb}`));
    if(hits.size===0&&cs){const ids=bySource.get(cs)||[];const exact=ids.filter(id=>norm(itemById.get(id)?.title)===t);if(exact.length)exact.forEach(id=>hits.add(id));else if(ids.length===1)hits.add(ids[0]);}
    if(hits.size===0&&t&&pd&&cost>=0)collect(byTitleDateCost.get(`${t}|${pd}|${Number(cost/qty).toFixed(2)}`));
    if(hits.size===0&&t){const ids=byTitle.get(t)||[];if(ids.length===1)hits.add(ids[0]);}
    let itemId:number|null=null;if(hits.size===1)itemId=[...hits][0];else if(hits.size>1){ambiguous++;details.push({product:title,customSku:r.cs,ebayItemId:r.eb,matches:[...hits]});}

    const item=itemId?itemById.get(itemId):null;
    const sale=await prisma.$transaction(async tx=>{
     const created=await tx.sale.create({data:{platform,externalOrderId:clean(r.ord)||null,externalListingId:eb||null,ingestionKey,saleAmount:amount,fees,shippingCost:shipping,soldAt,status:item?SaleStatus.MATCHED:SaleStatus.NEW,matchMethod:item?"FLIPWISE_HISTORICAL":null,matchConfidence:item?1:null,lines:{create:{inventoryItemId:item?.id??null,title,quantity:qty,unitPrice:qty?amount/qty:amount,cogsAtSale:cost||item?.cogs||null}}}});
     if(item){const remaining=Math.max(0,item.quantity-qty);await tx.inventoryItem.update({where:{id:item.id},data:{quantity:remaining,dispositionStatus:remaining===0?"SOLD":item.dispositionStatus,...(remaining===0?{disposedAt:soldAt,dispositionNote:`${platform} · $${amount.toFixed(2)}`}:{})}});if(remaining===0)await tx.listing.updateMany({where:{inventoryItemId:item.id,active:true},data:{active:false}});item.quantity=remaining;if(remaining===0)item.dispositionStatus="SOLD";}
     return created;
    });
    imported++;if(item)matched++;else unmatched++;
   }catch(e:any){failed++;details.push({product:r.p,error:e?.message||String(e)})}
  }
  return NextResponse.json({rows:rows.length,imported,deduped,matched,unmatched,ambiguous,failed,details:details.slice(0,20)});
 }catch(e:any){return NextResponse.json({error:e?.message||String(e)},{status:500})}
}
