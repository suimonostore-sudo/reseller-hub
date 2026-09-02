import {NextResponse} from "next/server";
import {prisma} from "@/src/lib/prisma";

export async function GET(){
  const items=await prisma.inventoryItem.findMany({
    select:{id:true,sku:true,sourceSku:true,title:true,cogs:true,location:true,purchaseStore:true,purchaseDate:true,listDate:true,listPrice:true,quantity:true,workflowStatus:true,dispositionStatus:true,listings:{select:{platform:true,externalId:true}}},
    orderBy:{id:"asc"}
  });
  return NextResponse.json(items);
}
