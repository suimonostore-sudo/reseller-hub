import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

function dateOrNull(v:any){return v?new Date(v):null}
function workflow(v:any,unlisted:any){const s=String(v||"").toUpperCase();if(["NEEDS_PHOTOS","PHOTOS_DONE","LISTED"].includes(s))return s;return unlisted?"NEEDS_PHOTOS":"LISTED"}
function disposition(v:any){const s=String(v||"ACTIVE").toUpperCase();return ["ACTIVE","SOLD","DONATED","DISCARDED","TRASHED"].includes(s)?s:"ACTIVE"}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params,b=await req.json(),itemId=Number(id);
  const data:any={};
  if(b.workflowStatus!==undefined){const w=workflow(b.workflowStatus,false);data.workflowStatus=w;data.unlisted=w!=="LISTED";if(w==="LISTED"&&b.setListDate!==false)data.listDate=b.listDate?dateOrNull(b.listDate):new Date();}
  if(b.location!==undefined)data.location=b.location||null;
  if(b.listPrice!==undefined)data.listPrice=b.listPrice==null||b.listPrice===""?null:Number(b.listPrice);
  if(b.title!==undefined)data.title=String(b.title);
  if(b.purchaseStore!==undefined)data.purchaseStore=b.purchaseStore||null;
  if(b.cogs!==undefined)data.cogs=b.cogs==null||b.cogs===""?null:Number(b.cogs);
  if(b.condition!==undefined)data.condition=b.condition||null;
  if(b.purchaseDate!==undefined)data.purchaseDate=dateOrNull(b.purchaseDate);
  if(b.quantity!==undefined)data.quantity=Math.max(0,Number(b.quantity)||0);
  if(b.listDate!==undefined)data.listDate=dateOrNull(b.listDate);
  if(b.sku!==undefined)data.sku=String(b.sku);
  if(b.sourceSku!==undefined)data.sourceSku=b.sourceSku||null;
  if(b.dispositionStatus!==undefined){
    const d=disposition(b.dispositionStatus);
    data.dispositionStatus=d;
    data.disposedAt=d==="ACTIVE"?null:(b.disposedAt!==undefined?dateOrNull(b.disposedAt):new Date());
    if(d==="ACTIVE")data.dispositionNote=null;
  }
  if(b.disposedAt!==undefined&&b.dispositionStatus===undefined)data.disposedAt=dateOrNull(b.disposedAt);
  if(b.dispositionNote!==undefined)data.dispositionNote=b.dispositionNote||null;
  if(!Object.keys(data).length)return NextResponse.json({error:"No supported fields supplied"},{status:400});
  const item=await prisma.inventoryItem.update({where:{id:itemId},data});
  return NextResponse.json(item);
}

export async function PUT(req:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params,b=await req.json(),itemId=Number(id),qty=Number(b.quantity??1);
  const existing=await prisma.inventoryItem.findUnique({where:{id:itemId},select:{bulkBuyId:true}});
  if(!existing)return NextResponse.json({error:"Inventory item not found"},{status:404});
  const bulkId=b.bulkBuyId===undefined?existing.bulkBuyId:(b.bulkBuyId?Number(b.bulkBuyId):null);
  if(bulkId){const buy=await prisma.bulkBuy.findUnique({where:{id:bulkId},include:{items:true}});if(!buy)return NextResponse.json({error:"Bulk purchase not found"},{status:404});const assigned=buy.items.filter(i=>i.id!==itemId).reduce((s,i)=>s+i.quantity,0);if(assigned+qty>buy.purchasedQty)return NextResponse.json({error:`Only ${buy.purchasedQty-assigned} units remain unassigned.`},{status:400});}
  const d=disposition(b.dispositionStatus);
  const item=await prisma.inventoryItem.update({where:{id:itemId},data:{sku:b.sku,sourceSku:b.sourceSku||null,title:b.title,quantity:qty,cogs:b.cogs==null||b.cogs===""?null:Number(b.cogs),condition:b.condition||null,location:b.location||null,unlisted:Boolean(b.unlisted),workflowStatus:workflow(b.workflowStatus,b.unlisted),dispositionStatus:d,disposedAt:d==="ACTIVE"?null:(dateOrNull(b.disposedAt)||new Date()),dispositionNote:d==="ACTIVE"?null:(b.dispositionNote||null),purchaseStore:b.purchaseStore||null,purchaseDate:dateOrNull(b.purchaseDate),listDate:dateOrNull(b.listDate),listPrice:b.listPrice==null||b.listPrice===""?null:Number(b.listPrice),bulkBuyId:bulkId}});
  return NextResponse.json(item);
}
export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;await prisma.inventoryItem.delete({where:{id:Number(id)}});return NextResponse.json({ok:true})}
