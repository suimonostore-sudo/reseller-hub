import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { Platform, SaleStatus } from "@prisma/client";

const platforms = new Set(["EBAY","POSHMARK","MERCARI","DEPOP"]);

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const itemId=Number(id);
  const b=await req.json();
  const platform=String(b.platform||"").toUpperCase();
  const saleAmount=Number(b.saleAmount);
  const quantity=Math.max(1,Number(b.quantity||1));
  const soldAt=b.soldAt?new Date(b.soldAt):new Date();

  if(!platforms.has(platform)) return NextResponse.json({error:"Choose a marketplace"},{status:400});
  if(!Number.isFinite(saleAmount)||saleAmount<0) return NextResponse.json({error:"Enter a valid sold price"},{status:400});

  const item=await prisma.inventoryItem.findUnique({where:{id:itemId}});
  if(!item) return NextResponse.json({error:"Inventory item not found"},{status:404});
  if(item.dispositionStatus!=="ACTIVE") return NextResponse.json({error:"Only active inventory can be marked sold"},{status:409});
  if(quantity>item.quantity) return NextResponse.json({error:`Only ${item.quantity} unit(s) are available`},{status:409});

  const remaining=item.quantity-quantity;
  const sale=await prisma.$transaction(async tx=>{
    const created=await tx.sale.create({
      data:{
        platform:platform as Platform,
        saleAmount,
        fees:0,
        shippingCost:0,
        soldAt,
        status:SaleStatus.MATCHED,
        matchMethod:"MANUAL_INVENTORY",
        matchConfidence:1,
        lines:{create:{
          inventoryItemId:item.id,
          title:item.title,
          quantity,
          unitPrice:quantity?saleAmount/quantity:saleAmount
        }}
      },
      include:{lines:true}
    });

    await tx.inventoryItem.update({
      where:{id:item.id},
      data:{
        quantity:remaining,
        ...(remaining===0?{
          dispositionStatus:"SOLD",
          disposedAt:soldAt,
          dispositionNote:`${platform} · $${saleAmount.toFixed(2)}`
        }:{})
      }
    });

    if(remaining===0){
      await tx.listing.updateMany({where:{inventoryItemId:item.id,active:true},data:{active:false}});
    }
    return created;
  });

  return NextResponse.json(sale,{status:201});
}
