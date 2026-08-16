import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export async function PUT(req:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params,b=await req.json(),itemId=Number(id),qty=Number(b.quantity??1),bulkId=b.bulkBuyId?Number(b.bulkBuyId):null;
  if(bulkId){const buy=await prisma.bulkBuy.findUnique({where:{id:bulkId},include:{items:true}});if(!buy)return NextResponse.json({error:"Bulk purchase not found"},{status:404});const assigned=buy.items.filter(i=>i.id!==itemId).reduce((s,i)=>s+i.quantity,0);if(assigned+qty>buy.purchasedQty)return NextResponse.json({error:`Only ${buy.purchasedQty-assigned} units remain unassigned.`},{status:400});}
  const item=await prisma.inventoryItem.update({where:{id:itemId},data:{sku:b.sku,title:b.title,quantity:qty,cogs:b.cogs==null?null:Number(b.cogs),condition:b.condition||null,location:b.location||null,unlisted:Boolean(b.unlisted),bulkBuyId:bulkId}});
  return NextResponse.json(item);
}
export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;await prisma.inventoryItem.delete({where:{id:Number(id)}});return NextResponse.json({ok:true})}
