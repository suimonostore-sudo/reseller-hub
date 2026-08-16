import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export async function GET() {
  const buys=await prisma.bulkBuy.findMany({include:{items:true},orderBy:{purchaseDate:"desc"}});
  return NextResponse.json(buys.map(b=>{const assigned=b.items.reduce((s,i)=>s+i.quantity,0);return {...b,unlistedQty:Math.max(0,b.purchasedQty-assigned)}}));
}
export async function POST(req:Request){
  const body=await req.json();const qty=Number(body.purchasedQty),cost=Number(body.totalCost);
  if(!body.name||qty<=0||cost<0)return NextResponse.json({error:"Invalid bulk purchase data"},{status:400});
  const buy=await prisma.bulkBuy.create({data:{name:body.name,purchaseDate:new Date(body.purchaseDate),totalCost:cost,purchasedQty:qty,unlistedQty:qty,notes:body.notes||null}});
  return NextResponse.json(buy,{status:201});
}
