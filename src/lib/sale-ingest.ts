import { prisma } from "@/src/lib/prisma";
import { Platform, SaleStatus } from "@prisma/client";

function norm(s:string){return s.toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ")}
function tokenScore(a:string,b:string){
  const A=new Set(norm(a).split(" ").filter(Boolean)), B=new Set(norm(b).split(" ").filter(Boolean));
  if(!A.size||!B.size)return 0;
  let hit=0; for(const x of A) if(B.has(x)) hit++;
  return hit/Math.max(A.size,B.size);
}

export async function findBestMatch(platform:Platform, externalListingId:string|undefined, title:string, sku?:string){
  if(sku){
    const exactSku=await prisma.inventoryItem.findUnique({where:{sku:sku.trim()}});
    if(exactSku) return {item:exactSku,method:"SKU",confidence:1};
  }

  if(externalListingId){
    const exact=await prisma.listing.findUnique({
      where:{platform_externalId:{platform,externalId:externalListingId}},
      include:{inventoryItem:true}
    });
    if(exact?.inventoryItem) return {item:exact.inventoryItem, method:"LISTING_ID", confidence:1};
  }

  const listings=await prisma.listing.findMany({
    where:{platform,active:true,inventoryItemId:{not:null}},
    include:{inventoryItem:true}
  });
  const n=norm(title);
  const exactTitle=listings.find(l=>norm(l.title)===n);
  if(exactTitle?.inventoryItem) return {item:exactTitle.inventoryItem,method:"EXACT_LISTING_TITLE",confidence:.98};

  let best:any=null,bestScore=0;
  for(const l of listings){
    const score=tokenScore(title,l.title);
    if(score>bestScore && l.inventoryItem){best=l.inventoryItem;bestScore=score}
  }
  if(best && bestScore>=0.82) return {item:best,method:"TITLE_SIMILARITY",confidence:bestScore};

  const items=await prisma.inventoryItem.findMany();
  const exactItem=items.find(i=>norm(i.title)===n);
  if(exactItem) return {item:exactItem,method:"EXACT_INVENTORY_TITLE",confidence:.95};

  let bestItem:any=null,bestItemScore=0;
  for(const i of items){
    const score=tokenScore(title,i.title);
    if(score>bestItemScore){bestItem=i;bestItemScore=score}
  }
  if(bestItem && bestItemScore>=0.9) return {item:bestItem,method:"INVENTORY_TITLE_SIMILARITY",confidence:bestItemScore};

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
        soldAt:input.soldAt?new Date(input.soldAt):new Date(),
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
    if(item) await tx.inventoryItem.update({where:{id:item.id},data:{quantity:{decrement:qty}}});
    return created;
  });

  return {sale,deduped:false,match};
}
