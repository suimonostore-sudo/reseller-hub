import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { parseMarketplaceSale } from "@/src/lib/email-parser";
import { findBestMatch } from "@/src/lib/sale-ingest";
import { SaleStatus } from "@prisma/client";

export async function POST(){
  const sales=await prisma.sale.findMany({
    where:{status:SaleStatus.NEW},
    include:{lines:true}
  });
  let reparsed=0,matched=0,skipped=0;

  for(const sale of sales){
    const line=sale.lines[0];
    if(!line){skipped++;continue;}

    let title=line.title;
    let buyer=sale.buyerUsername||undefined;
    let externalOrderId=sale.externalOrderId||undefined;
    let externalListingId=sale.externalListingId||undefined;
    let sku: string|undefined;
    let saleAmount=sale.saleAmount;
    let fees=sale.fees;
    let shippingCost=sale.shippingCost;

    if(sale.sourceEmailId){
      const email=await prisma.emailMessage.findUnique({where:{messageId:sale.sourceEmailId}});
      if(email?.marketplace){
        const parsed=parseMarketplaceSale(email.marketplace,email.subject||"",email.bodyText||"");
        if(parsed){
          title=parsed.title||title;
          buyer=parsed.buyerUsername||buyer;
          externalOrderId=parsed.externalOrderId||externalOrderId;
          externalListingId=parsed.externalListingId||externalListingId;
          sku=parsed.sku||undefined;
          saleAmount=parsed.saleAmount||saleAmount;
          fees=parsed.fees??fees;
          shippingCost=parsed.shippingCost??shippingCost;
          await prisma.$transaction([
            prisma.sale.update({where:{id:sale.id},data:{buyerUsername:buyer||null,externalOrderId:externalOrderId||null,externalListingId:externalListingId||null,saleAmount,fees,shippingCost}}),
            prisma.saleLine.update({where:{id:line.id},data:{title,unitPrice:line.quantity?saleAmount/line.quantity:saleAmount}})
          ]);
          reparsed++;
        }
      }
    }

    const match=await findBestMatch(sale.platform,externalListingId,title,sku);
    if(!match){continue;}
    const qty=line.quantity||1;
    if(match.item.quantity<qty){skipped++;continue;}

    await prisma.$transaction(async tx=>{
      const fresh=await tx.sale.findUnique({where:{id:sale.id},include:{lines:true}});
      if(!fresh || fresh.status!==SaleStatus.NEW) return;
      const freshLine=fresh.lines[0];
      if(!freshLine || freshLine.inventoryItemId) return;
      const freshItem=await tx.inventoryItem.findUnique({where:{id:match.item.id}});
      if(!freshItem || freshItem.quantity<qty) return;
      await tx.inventoryItem.update({where:{id:freshItem.id},data:{quantity:{decrement:qty}}});
      await tx.saleLine.update({where:{id:freshLine.id},data:{inventoryItemId:freshItem.id}});
      await tx.sale.update({where:{id:sale.id},data:{status:SaleStatus.MATCHED,matchMethod:match.method,matchConfidence:match.confidence}});
      matched++;
    });
  }

  return NextResponse.json({ok:true,checked:sales.length,reparsed,matched,skipped});
}
