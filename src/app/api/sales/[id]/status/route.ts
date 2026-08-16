import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { SaleStatus } from "@prisma/client";
const allowed=["NEW","MATCHED","PICKED","PACKED","SHIPPED","CANCELLED"];
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params; const {status}=await req.json();
  if(!allowed.includes(status))return NextResponse.json({error:"Invalid status"},{status:400});
  const sale=await prisma.sale.findUnique({where:{id:Number(id)},include:{lines:true}});
  if(!sale)return NextResponse.json({error:"Sale not found"},{status:404});
  if(status!=="NEW" && sale.lines.some(l=>!l.inventoryItemId) && ["PICKED","PACKED","SHIPPED"].includes(status))
    return NextResponse.json({error:"This order still needs a SKU match."},{status:409});
  return NextResponse.json(await prisma.sale.update({where:{id:Number(id)},data:{status:status as SaleStatus},include:{lines:{include:{inventoryItem:true}},shippingLabel:true}}));
}
