
import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { ingestSale } from "@/src/lib/sale-ingest";

export async function GET(){
  const sales=await prisma.sale.findMany({
    include:{lines:{include:{inventoryItem:true}},shippingLabel:true},
    orderBy:{soldAt:"desc"}
  });
  return NextResponse.json(sales);
}

export async function POST(req:Request){
  const b=await req.json();
  if(!b.platform||!b.title||b.saleAmount===undefined)
    return NextResponse.json({error:"Platform, title and sale amount are required"},{status:400});
  const result=await ingestSale(b);
  if((result as any).error) return NextResponse.json({error:(result as any).error},{status:(result as any).status||400});
  return NextResponse.json(result,{status:(result as any).deduped?200:201});
}
