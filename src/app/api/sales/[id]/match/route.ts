import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { SaleStatus } from "@prisma/client";

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params; const saleId=Number(id); const b=await req.json(); const inventoryItemId=Number(b.inventoryItemId);
  if(!inventoryItemId) return NextResponse.json({error:"Inventory SKU is required"},{status:400});
  const sale=await prisma.sale.findUnique({where:{id:saleId},include:{lines:true}});
  if(!sale) return NextResponse.json({error:"Sale not found"},{status:404});
  const line=sale.lines[0]; const item=await prisma.inventoryItem.findUnique({where:{id:inventoryItemId}});
  if(!item) return NextResponse.json({error:"Inventory item not found"},{status:404});
  const qty=line?.quantity??1;
  if(line?.inventoryItemId===inventoryItemId) return NextResponse.json({ok:true});
  if(item.dispositionStatus!=="ACTIVE"||item.quantity<qty) return NextResponse.json({error:`${item.sku} only has ${item.quantity} available.`},{status:409});
  await prisma.$transaction(async tx=>{
    if(line?.inventoryItemId){
      const previous=await tx.inventoryItem.update({where:{id:line.inventoryItemId},data:{quantity:{increment:qty}}});
      if(previous.dispositionStatus==="SOLD") await tx.inventoryItem.update({where:{id:previous.id},data:{dispositionStatus:"ACTIVE",disposedAt:null,dispositionNote:null}});
    }
    const remaining=item.quantity-qty;
    await tx.inventoryItem.update({where:{id:inventoryItemId},data:{quantity:remaining,...(remaining===0?{dispositionStatus:"SOLD",disposedAt:sale.soldAt,dispositionNote:`${sale.platform} · $${sale.saleAmount.toFixed(2)}`}:{})}});
    if(remaining===0) await tx.listing.updateMany({where:{inventoryItemId,active:true},data:{active:false}});
    if(line) await tx.saleLine.update({where:{id:line.id},data:{inventoryItemId}});
    await tx.sale.update({where:{id:saleId},data:{status:SaleStatus.MATCHED,matchMethod:"MANUAL_SKU",matchConfidence:1}});
  });
  return NextResponse.json({ok:true});
}
