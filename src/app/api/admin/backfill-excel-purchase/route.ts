import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

const KEY="ntgl4GRmxCZsl2mU5rDu3sSTrNVrAA3k";
function norm(s:string){return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}

export async function POST(req:Request){
  const url=new URL(req.url);
  if(url.searchParams.get("key")!==KEY)return NextResponse.json({error:"Not found"},{status:404});
  const body=await req.json();
  const values=(body&&body.values)||{};
  const items=await prisma.inventoryItem.findMany({select:{id:true,title:true,purchaseStore:true,purchaseDate:true}});
  const missingStoreBefore=items.filter(i=>!i.purchaseStore).length;
  const missingDateBefore=items.filter(i=>!i.purchaseDate).length;
  const missingEitherBefore=items.filter(i=>!i.purchaseStore||!i.purchaseDate).length;
  let matchedItems=0,updatedItems=0,storeFilled=0,dateFilled=0;
  for(const item of items){
    if(item.purchaseStore&&item.purchaseDate)continue;
    const hit=values[norm(item.title)];
    if(!hit)continue;
    matchedItems++;
    const data:any={};
    if(!item.purchaseStore&&hit.store){data.purchaseStore=String(hit.store);storeFilled++;}
    if(!item.purchaseDate&&hit.date){data.purchaseDate=new Date(String(hit.date));dateFilled++;}
    if(Object.keys(data).length){await prisma.inventoryItem.update({where:{id:item.id},data});updatedItems++;}
  }
  const after=await prisma.inventoryItem.findMany({select:{purchaseStore:true,purchaseDate:true}});
  return NextResponse.json({total:items.length,missingStoreBefore,missingDateBefore,missingEitherBefore,matchedItems,updatedItems,storeFilled,dateFilled,missingStoreAfter:after.filter(i=>!i.purchaseStore).length,missingDateAfter:after.filter(i=>!i.purchaseDate).length,missingEitherAfter:after.filter(i=>!i.purchaseStore||!i.purchaseDate).length});
}
