import { prisma } from "@/src/lib/prisma";
import { Platform, SaleStatus } from "@prisma/client";

function norm(s:string){return s.toLowerCase().replace(/[^a-z0-9.]+/g," ").trim().replace(/\s+/g," ")}
function tokenScore(a:string,b:string){
  const A=new Set(norm(a).split(" ").filter(Boolean)), B=new Set(norm(b).split(" ").filter(Boolean));
  if(!A.size||!B.size)return 0;
  let hit=0; for(const x of A) if(B.has(x)) hit++;
  return hit/Math.max(A.size,B.size);
}
function sizeTokens(s:string){
  const n=` ${norm(s)} `;
  const out=new Set<string>();
  const patterns=[
    /\b(?:size|sz)\s*([0-9]{1,2}(?:\.5)?|[xsml]{1,3}|xxl|xxxl)\b/g,
    /\b(?:mens?|womens?|men|women)\s*([0-9]{1,2}(?:\.5)?)\b/g,
    /\b(?:us)\s*([0-9]{1,2}(?:\.5)?)\b/g,
  ];
  for(const re of patterns){let m:RegExpExecArray|null;while((m=re.exec(n)))out.add(m[1].toLowerCase())}
  return out;
}
function hasSizeConflict(a:string,b:string){
  const A=sizeTokens(a),B=sizeTokens(b);
  if(!A.size||!B.size)return false;
  for(const x of A) if(B.has(x)) return false;
  return true;
}
function chooseUnique<T extends {title:string}>(title:string, candidates:T[], minimum:number, gap:number){
  let best:T|null=null,bestScore=0,second=0;
  for(const item of candidates){
    if(hasSizeConflict(title,item.title))continue;
    const score=tokenScore(title,item.title);
    if(score>bestScore){second=bestScore;best=item;bestScore=score}else if(score>second)second=score;
  }
  return best&&bestScore>=minimum&&bestScore-second>=gap?{item:best,score:bestScore}:null;
}
function chooseUniquePrefix<T extends {title:string}>(title:string,candidates:T[]){
  const n=norm(title);
  const words=n.split(" ").filter(Boolean);
  if(n.length<28||words.length<5)return null;
  const hits=candidates.filter(item=>{
    if(hasSizeConflict(title,item.title))return false;
    const c=norm(item.title);
    return c.startsWith(n)||n.startsWith(c);
  });
  return hits.length===1?{item:hits[0],score:.97}:null;
}
const activeInventory={dispositionStatus:"ACTIVE",quantity:{gt:0}} as const;

export async function findBestMatch(platform:Platform, externalListingId:string|undefined, title:string, sku?:string){
  if(sku){
    const cleanedSku=sku.trim();
    const internal=await prisma.inventoryItem.findFirst({where:{sku:cleanedSku,...activeInventory}});
    if(internal && !hasSizeConflict(title,internal.title)) return {item:internal,method:"SKU",confidence:1};

    const sourceMatches=await prisma.inventoryItem.findMany({where:{sourceSku:cleanedSku,...activeInventory}});
    if(sourceMatches.length===1){
      const score=tokenScore(title,sourceMatches[0].title);
      if(!hasSizeConflict(title,sourceMatches[0].title)&&score>=0.9) return {item:sourceMatches[0],method:"SOURCE_SKU_TITLE",confidence:score};
    } else if(sourceMatches.length>1){
      const exact=sourceMatches.find(i=>norm(i.title)===norm(title));
      if(exact) return {item:exact,method:"SOURCE_SKU_EXACT_TITLE",confidence:1};
      const picked=chooseUnique(title,sourceMatches,0.94,0.08);
      if(picked) return {item:picked.item,method:"SOURCE_SKU_TITLE",confidence:picked.score};
    }
  }

  if(externalListingId){
    const exact=await prisma.listing.findUnique({
      where:{platform_externalId:{platform,externalId:externalListingId}},
      include:{inventoryItem:true}
    });
    if(exact?.inventoryItem && exact.inventoryItem.dispositionStatus==="ACTIVE" && exact.inventoryItem.quantity>0 && !hasSizeConflict(title,exact.inventoryItem.title)) return {item:exact.inventoryItem, method:"LISTING_ID", confidence:1};
  }

  const listings=await prisma.listing.findMany({
    where:{platform,active:true,inventoryItemId:{not:null},inventoryItem:{is:{...activeInventory}}},
    include:{inventoryItem:true}
  });
  const n=norm(title);
  const exactTitle=listings.find(l=>norm(l.title)===n && l.inventoryItem && !hasSizeConflict(title,l.inventoryItem.title));
  if(exactTitle?.inventoryItem) return {item:exactTitle.inventoryItem,method:"EXACT_LISTING_TITLE",confidence:.98};

  const listingCandidates=listings.filter(l=>l.inventoryItem).map(l=>({title:l.title,item:l.inventoryItem!}));
  const prefixListing=chooseUniquePrefix(title,listingCandidates);
  if(prefixListing) return {item:prefixListing.item.item,method:"TRUNCATED_LISTING_TITLE",confidence:prefixListing.score};
  const pickedListing=chooseUnique(title,listingCandidates,0.86,0.07);
  if(pickedListing) return {item:pickedListing.item.item,method:"TITLE_SIMILARITY",confidence:pickedListing.score};

  const items=await prisma.inventoryItem.findMany({where:{...activeInventory}});
  const exactItem=items.find(i=>norm(i.title)===n && !hasSizeConflict(title,i.title));
  if(exactItem) return {item:exactItem,method:"EXACT_INVENTORY_TITLE",confidence:.95};

  const prefixItem=chooseUniquePrefix(title,items);
  if(prefixItem) return {item:prefixItem.item,method:"TRUNCATED_INVENTORY_TITLE",confidence:prefixItem.score};
  const pickedItem=chooseUnique(title,items,0.92,0.08);
  if(pickedItem) return {item:pickedItem.item,method:"INVENTORY_TITLE_SIMILARITY",confidence:pickedItem.score};

  return null;
}

async function findReminderDuplicate(input:any, platform:Platform, amount:number){
  if(input.externalOrderId || !input.buyerUsername || !input.title || amount<=0) return null;
  const soldAt=input.soldAt?new Date(input.soldAt):new Date();
  const from=new Date(soldAt.getTime()-3*24*60*60*1000);
  const to=new Date(soldAt.getTime()+3*24*60*60*1000);
  const candidates=await prisma.sale.findMany({
    where:{platform,buyerUsername:input.buyerUsername,saleAmount:amount,soldAt:{gte:from,lte:to}},
    include:{lines:{include:{inventoryItem:true}}}
  });
  for(const sale of candidates){
    const line=sale.lines[0];
    if(line && tokenScore(input.title,line.title)>=0.96) return sale;
  }
  return null;
}

export async function ingestSale(input:any){
  const platform=input.platform as Platform;
  const qty=Math.max(1,Number(input.quantity??1));
  const amount=Number(input.saleAmount??0);
  const fees=Number(input.fees??0);
  const shipping=Number(input.shippingCost??0);
  const soldAt=input.soldAt?new Date(input.soldAt):new Date();
  const ingestionKey=input.ingestionKey || [
    platform,input.externalOrderId||"",input.sourceEmailId||"",input.title||"",input.buyerUsername||""
  ].join("|");

  const existing=await prisma.sale.findUnique({where:{ingestionKey},include:{lines:{include:{inventoryItem:true}}}});
  if(existing) return {sale:existing,deduped:true};

  const reminderDuplicate=await findReminderDuplicate(input,platform,amount);
  if(reminderDuplicate) return {sale:reminderDuplicate,deduped:true,reminderDuplicate:true};

  const match=await findBestMatch(platform,input.externalListingId,input.title,input.sku);
  const item=match?.item??null;

  if(item && item.quantity<qty){
    return {error:`Matched SKU ${item.sku} only has ${item.quantity} unit(s) available.`,status:409};
  }

  const sale=await prisma.$transaction(async tx=>{
    const created=await tx.sale.create({
      data:{
        platform,
        externalOrderId:input.externalOrderId||null,
        externalListingId:input.externalListingId||null,
        ingestionKey,
        buyerUsername:input.buyerUsername||null,
        saleAmount:amount,
        fees,
        shippingCost:shipping,
        sourceEmailId:input.sourceEmailId||null,
        soldAt,
        status:item?SaleStatus.MATCHED:SaleStatus.NEW,
        matchMethod:match?.method||null,
        matchConfidence:match?.confidence??null,
        lines:{create:{
          inventoryItemId:item?.id??null,
          title:input.title,
          quantity:qty,
          unitPrice:qty?amount/qty:amount
        }}
      },
      include:{lines:{include:{inventoryItem:true}}}
    });
    if(item){
      const remaining=item.quantity-qty;
      await tx.inventoryItem.update({where:{id:item.id},data:{quantity:remaining,...(remaining===0?{dispositionStatus:"SOLD",disposedAt:soldAt,dispositionNote:`${platform} · $${amount.toFixed(2)}`}:{})}});
      if(remaining===0) await tx.listing.updateMany({where:{inventoryItemId:item.id,active:true},data:{active:false}});
    }
    return created;
  });

  return {sale,deduped:false,match};
}