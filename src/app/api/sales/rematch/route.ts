import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { parseMarketplaceSale } from "@/src/lib/email-parser";
import { findBestMatch } from "@/src/lib/sale-ingest";
import { SaleStatus } from "@prisma/client";

async function candidates(){
  const sales=await prisma.sale.findMany({where:{status:SaleStatus.NEW},include:{lines:true}});
  const out:any[]=[];
  for(const sale of sales){
    const line=sale.lines[0]; if(!line) continue;
    let title=line.title, externalListingId=sale.externalListingId||undefined, sku:string|undefined;
    if(sale.sourceEmailId){
      const email=await prisma.emailMessage.findUnique({where:{messageId:sale.sourceEmailId}});
      if(email?.marketplace){const p=parseMarketplaceSale(email.marketplace,email.subject||"",email.bodyText||"");if(p){title=p.title||title;externalListingId=p.externalListingId||externalListingId;sku=p.sku||undefined;}}
    }
    const match=await findBestMatch(sale.platform,externalListingId,title,sku);
    if(match) out.push({sale,line,title,sku,match});
  }
  return {sales,out};
}
export async function GET(){
  const {sales,out}=await candidates();
  return NextResponse.json({checked:sales.length,matched:out.length,matches:out.map(x=>({saleId:x.sale.id,platform:x.sale.platform,saleTitle:x.title,emailSku:x.sku||null,inventorySku:x.match.item.sku,sourceSku:x.match.item.sourceSku||null,inventoryTitle:x.match.item.title,method:x.match.method,confidence:x.match.confidence}))});
}
export async function POST(){
  const {sales,out}=await candidates(); let matched=0,skipped=0,inventoryUpdated=0;
  for(const x of out){
    const qty=x.line.quantity||1;
    if(x.match.item.quantity<qty){skipped++;continue;}
    await prisma.$transaction(async tx=>{
      const fresh=await tx.sale.findUnique({where:{id:x.sale.id},include:{lines:true}});
      if(!fresh||fresh.status!==SaleStatus.NEW)return;
      const fl=fresh.lines[0];if(!fl||fl.inventoryItemId)return;
      await tx.saleLine.update({where:{id:fl.id},data:{inventoryItemId:x.match.item.id}});
      await tx.sale.update({where:{id:x.sale.id},data:{status:SaleStatus.MATCHED,matchMethod:x.match.method,matchConfidence:x.match.confidence}});
      if(fresh.sourceEmailId){
        const item=await tx.inventoryItem.findUnique({where:{id:x.match.item.id}});
        if(item && item.dispositionStatus==="ACTIVE" && item.quantity>=qty){
          const remaining=item.quantity-qty;
          await tx.inventoryItem.update({where:{id:item.id},data:{quantity:remaining,...(remaining===0?{dispositionStatus:"SOLD",disposedAt:fresh.soldAt,dispositionNote:`${fresh.platform} · $${Number(fresh.saleAmount).toFixed(2)}`}:{})}});
          if(remaining===0) await tx.listing.updateMany({where:{inventoryItemId:item.id,active:true},data:{active:false}});
          inventoryUpdated++;
        }
      }
      matched++;
    });
  }
  return NextResponse.json({ok:true,checked:sales.length,matched,skipped,inventoryUpdated,note:"Gmail-origin sales update current inventory; historical imports remain non-destructive."});
}
