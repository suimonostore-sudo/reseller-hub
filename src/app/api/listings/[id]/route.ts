import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export async function PUT(req:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params,b=await req.json();
  const l=await prisma.listing.update({where:{id:Number(id)},data:{
    platform:b.platform,externalId:b.externalId,title:b.title,quantity:Number(b.quantity??1),
    active:Boolean(b.active),inventoryItemId:b.inventoryItemId?Number(b.inventoryItemId):null
  },include:{inventoryItem:true}});
  return NextResponse.json(l);
}
export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;await prisma.listing.delete({where:{id:Number(id)}});return NextResponse.json({ok:true});
}
