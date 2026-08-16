import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export async function GET(){
  return NextResponse.json(await prisma.listing.findMany({
    include:{inventoryItem:true},
    orderBy:{updatedAt:"desc"}
  }));
}
export async function POST(req:Request){
  const b=await req.json();
  if(!b.platform||!b.externalId||!b.title||!b.inventoryItemId)
    return NextResponse.json({error:"Marketplace, listing ID, title and SKU are required"},{status:400});
  try{
    const l=await prisma.listing.create({data:{
      platform:b.platform,externalId:b.externalId,title:b.title,quantity:Number(b.quantity??1),
      active:Boolean(b.active),inventoryItemId:Number(b.inventoryItemId)
    },include:{inventoryItem:true}});
    return NextResponse.json(l,{status:201});
  }catch(e:any){
    return NextResponse.json({error:"A listing with this marketplace and ID already exists."},{status:409});
  }
}
