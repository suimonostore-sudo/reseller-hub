import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

function dateOrNull(v:any){return v?new Date(v):null}
function workflow(v:any,unlisted:any){const s=String(v||"").toUpperCase();if(["NEEDS_PHOTOS","PHOTOS_DONE","LISTED"].includes(s))return s;return unlisted?"NEEDS_PHOTOS":"LISTED"}
function disposition(v:any){const s=String(v||"ACTIVE").toUpperCase();return ["ACTIVE","DONATED","TRASHED"].includes(s)?s:"ACTIVE"}

export async function GET(){return NextResponse.json(await prisma.inventoryItem.findMany({include:{bulkBuy:true,listings:true},orderBy:{updatedAt:"desc"}}))}

export async function POST(req:Request){
  const b=await req.json();
  if(Array.isArray(b.items)){
    const items=b.items.filter((x:any)=>x?.sku&&x?.title&&Number(x.quantity??1)>0).map((x:any)=>({
      sku:String(x.sku).trim(),sourceSku:x.sourceSku?String(x.sourceSku).trim():null,title:String(x.title).trim(),
      quantity:Number(x.quantity??1),cogs:x.cogs==null||x.cogs===""?null:Number(x.cogs),
      condition:x.condition||null,location:x.location||null,unlisted:Boolean(x.unlisted),workflowStatus:workflow(x.workflowStatus,x.unlisted),
      dispositionStatus:disposition(x.dispositionStatus),disposedAt:dateOrNull(x.disposedAt),dispositionNote:x.dispositionNote||null,
      purchaseStore:x.purchaseStore||null,purchaseDate:dateOrNull(x.purchaseDate),listDate:dateOrNull(x.listDate),listPrice:x.listPrice==null||x.listPrice===""?null:Number(x.listPrice),
      bulkBuyId:null,...(x.createdAt?{createdAt:new Date(x.createdAt)}:{})
    }));
    if(!items.length)return NextResponse.json({error:"No valid inventory rows found"},{status:400});
    const result=await prisma.inventoryItem.createMany({data:items,skipDuplicates:false});
    return NextResponse.json({created:result.count},{status:201});
  }
  const qty=Number(b.quantity??1),bulkId=b.bulkBuyId?Number(b.bulkBuyId):null;
  if(!b.sku||!b.title||qty<1)return NextResponse.json({error:"RH SKU, title and quantity are required"},{status:400});
  if(bulkId){const buy=await prisma.bulkBuy.findUnique({where:{id:bulkId},include:{items:true}});if(!buy)return NextResponse.json({error:"Bulk purchase not found"},{status:404});const assigned=buy.items.reduce((s,i)=>s+i.quantity,0);if(assigned+qty>buy.purchasedQty)return NextResponse.json({error:`Only ${buy.purchasedQty-assigned} units remain unassigned in this bulk purchase.`},{status:400});}
  const item=await prisma.inventoryItem.create({data:{sku:b.sku,sourceSku:b.sourceSku||null,title:b.title,quantity:qty,cogs:b.cogs==null?null:Number(b.cogs),condition:b.condition||null,location:b.location||null,unlisted:Boolean(b.unlisted),workflowStatus:workflow(b.workflowStatus,b.unlisted),dispositionStatus:disposition(b.dispositionStatus),disposedAt:dateOrNull(b.disposedAt),dispositionNote:b.dispositionNote||null,purchaseStore:b.purchaseStore||null,purchaseDate:dateOrNull(b.purchaseDate),listDate:dateOrNull(b.listDate),listPrice:b.listPrice==null||b.listPrice===""?null:Number(b.listPrice),bulkBuyId:bulkId}});
  return NextResponse.json(item,{status:201});
}
