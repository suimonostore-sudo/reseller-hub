import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { parseMarketplaceSale } from "@/src/lib/email-parser";
import { SaleStatus } from "@prisma/client";

function norm(s:string){return String(s||"").toLowerCase().replace(/[^a-z0-9.]+/g," ").trim().replace(/\s+/g," ")}
function tokenScore(a:string,b:string){const A=new Set(norm(a).split(" ").filter(Boolean)),B=new Set(norm(b).split(" ").filter(Boolean));if(!A.size||!B.size)return 0;let hit=0;for(const x of A)if(B.has(x))hit++;return hit/Math.max(A.size,B.size)}
function sizeTokens(s:string){const n=` ${norm(s)} `,out=new Set<string>();for(const re of [/\b(?:size|sz)\s*([0-9]{1,2}(?:\.5)?|[xsml]{1,3}|xxl|xxxl)\b/g,/\b(?:mens?|womens?|men|women)\s*([0-9]{1,2}(?:\.5)?)\b/g,/\bus\s*([0-9]{1,2}(?:\.5)?)\b/g]){let m:RegExpExecArray|null;while((m=re.exec(n)))out.add(m[1].toLowerCase())}return out}
function sizeConflict(a:string,b:string){const A=sizeTokens(a),B=sizeTokens(b);if(!A.size||!B.size)return false;for(const x of A)if(B.has(x))return false;return true}
function cleanListing(v?:string|null){return String(v||"").trim().replace(/\.0$/,"")}

async function buildCandidates(){
  const [sales,items,listings,emails]=await Promise.all([
    prisma.sale.findMany({where:{status:SaleStatus.NEW},include:{lines:true},orderBy:{soldAt:"desc"}}),
    prisma.inventoryItem.findMany({include:{listings:true}}),
    prisma.listing.findMany({where:{inventoryItemId:{not:null}}}),
    prisma.emailMessage.findMany({select:{messageId:true,marketplace:true,subject:true,bodyText:true}})
  ]);
  const emailById=new Map(emails.map(e=>[e.messageId,e]));
  const listingByKey=new Map<string,number[]>();
  for(const l of listings){const k=`${l.platform}|${cleanListing(l.externalId)}`;if(!listingByKey.has(k))listingByKey.set(k,[]);listingByKey.get(k)!.push(l.inventoryItemId!)}
  const itemById=new Map(items.map(i=>[i.id,i]));
  const bySku=new Map<string,typeof items>();const bySource=new Map<string,typeof items>();
  for(const i of items){const sk=i.sku.trim();if(sk){if(!bySku.has(sk))bySku.set(sk,[] as any);bySku.get(sk)!.push(i)}const ss=i.sourceSku?.trim();if(ss){if(!bySource.has(ss))bySource.set(ss,[] as any);bySource.get(ss)!.push(i)}}
  const out:any[]=[];let ignoredNonSaleEmail=0;
  for(const sale of sales){
    const line=sale.lines[0];if(!line||line.inventoryItemId)continue;
    let title=line.title||"",externalListingId=sale.externalListingId||undefined,sku:string|undefined;
    if(sale.sourceEmailId){const email=emailById.get(sale.sourceEmailId);if(email?.marketplace){const p=parseMarketplaceSale(email.marketplace,email.subject||"",email.bodyText||"");if(!p){ignoredNonSaleEmail++;continue}title=p.title||title;externalListingId=p.externalListingId||externalListingId;sku=p.sku||undefined}}
    if(!title||title===".")continue;
    let match:any=null;
    const choose=(arr:any[],method:string,confidence:number)=>{const eligible=arr.filter(i=>!sizeConflict(title,i.title));if(eligible.length===1)match={item:eligible[0],method,confidence}}
    if(sku&&!match){choose(bySku.get(sku.trim())||[],"SKU",1);if(!match){const ss=(bySource.get(sku.trim())||[]).filter(i=>!sizeConflict(title,i.title));if(ss.length===1)match={item:ss[0],method:"SOURCE_SKU",confidence:.995};else if(ss.length>1){const exact=ss.filter(i=>norm(i.title)===norm(title));if(exact.length===1)match={item:exact[0],method:"SOURCE_SKU_EXACT_TITLE",confidence:1}}}}
    if(externalListingId&&!match){const ids=listingByKey.get(`${sale.platform}|${cleanListing(externalListingId)}`)||[];const unique=[...new Set(ids)].map(id=>itemById.get(id)).filter(Boolean) as any[];choose(unique,"LISTING_ID",1)}
    if(!match){const exact=items.filter(i=>norm(i.title)===norm(title)&&!sizeConflict(title,i.title));if(exact.length===1)match={item:exact[0],method:"EXACT_TITLE",confidence:.99}}
    if(!match){const n=norm(title),words=n.split(" ").filter(Boolean);if(n.length>=28&&words.length>=5){const pref=items.filter(i=>{if(sizeConflict(title,i.title))return false;const c=norm(i.title);return c.startsWith(n)||n.startsWith(c)});if(pref.length===1)match={item:pref[0],method:"UNIQUE_PREFIX_TITLE",confidence:.975}}}
    if(!match){let best:any=null,bestScore=0,second=0;for(const i of items){if(sizeConflict(title,i.title))continue;const score=tokenScore(title,i.title);if(score>bestScore){second=bestScore;best=i;bestScore=score}else if(score>second)second=score}if(best&&bestScore>=.94&&bestScore-second>=.12)match={item:best,method:"HIGH_CONFIDENCE_TITLE",confidence:bestScore}}
    if(match)out.push({sale,line,title,sku,match});
  }
  return {sales,out,ignoredNonSaleEmail};
}

export async function GET(){const {sales,out,ignoredNonSaleEmail}=await buildCandidates();return NextResponse.json({checked:sales.length,matched:out.length,ignoredNonSaleEmail,matches:out.map(x=>({saleId:x.sale.id,platform:x.sale.platform,soldAt:x.sale.soldAt,saleTitle:x.title,emailSku:x.sku||null,inventoryId:x.match.item.id,inventorySku:x.match.item.sku,sourceSku:x.match.item.sourceSku||null,inventoryTitle:x.match.item.title,currentQty:x.match.item.quantity,currentDisposition:x.match.item.dispositionStatus,method:x.match.method,confidence:x.match.confidence}))})}

export async function POST(){
  const {sales,out,ignoredNonSaleEmail}=await buildCandidates();let matched=0,inventoryUpdated=0,linkedOnly=0,skipped=0;
  for(const x of out){
    const qty=Math.max(1,Number(x.line.quantity||1));
    try{await prisma.$transaction(async tx=>{
      const fresh=await tx.sale.findUnique({where:{id:x.sale.id},include:{lines:true}});if(!fresh||fresh.status!==SaleStatus.NEW)return;
      const fl=fresh.lines[0];if(!fl||fl.inventoryItemId)return;
      const item=await tx.inventoryItem.findUnique({where:{id:x.match.item.id}});if(!item)return;
      await tx.saleLine.update({where:{id:fl.id},data:{inventoryItemId:item.id}});
      await tx.sale.update({where:{id:fresh.id},data:{status:SaleStatus.MATCHED,matchMethod:x.match.method,matchConfidence:x.match.confidence}});
      if(item.dispositionStatus==="ACTIVE"){
        const remaining=Math.max(0,item.quantity-qty);
        await tx.inventoryItem.update({where:{id:item.id},data:{quantity:remaining,...(remaining===0?{dispositionStatus:"SOLD",unlisted:true,disposedAt:fresh.soldAt,dispositionNote:`${fresh.platform} · $${Number(fresh.saleAmount).toFixed(2)}`}:{})}});
        if(remaining===0)await tx.listing.updateMany({where:{inventoryItemId:item.id,active:true},data:{active:false,quantity:0}});
        inventoryUpdated++;
      }else linkedOnly++;
      matched++;
    })}catch{skipped++}
  }
  return NextResponse.json({ok:true,checked:sales.length,candidates:out.length,matched,inventoryUpdated,linkedOnly,skipped,ignoredNonSaleEmail,note:"Only unique high-confidence matches were applied. Existing non-active inventory was linked without changing quantity/status."});
}
