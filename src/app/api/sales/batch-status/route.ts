import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { SaleStatus } from "@prisma/client";
const allowed=["PICKED","PACKED","SHIPPED"];
export async function POST(req:Request){
  const {ids,status}=await req.json();
  if(!Array.isArray(ids)||!ids.length||!allowed.includes(status))return NextResponse.json({error:"Invalid batch request"},{status:400});
  const sales=await prisma.sale.findMany({where:{id:{in:ids.map(Number)}},include:{lines:true}});
  if(sales.some(s=>s.lines.some(l=>!l.inventoryItemId)))return NextResponse.json({error:"Every selected order must have a SKU match."},{status:409});
  await prisma.sale.updateMany({where:{id:{in:ids.map(Number)}},data:{status:status as SaleStatus}});
  return NextResponse.json({ok:true,count:sales.length});
}
