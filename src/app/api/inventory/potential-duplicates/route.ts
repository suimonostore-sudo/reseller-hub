import {NextResponse} from "next/server";
import {prisma} from "@/src/lib/prisma";

const norm=(v:any)=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");

export async function GET(){
 const items=await prisma.inventoryItem.findMany({
  include:{listings:{select:{id:true,platform:true,externalId:true,active:true,quantity:true}},saleLines:{select:{id:true,quantity:true}}},
  orderBy:[{createdAt:"asc"},{id:"asc"}]
 });
 const groups=new Map<string,typeof items>();
 for(const i of items){
  const title=norm(i.title),source=norm(i.sourceSku);
  if(!title)continue;
  const key=`${source}|${title}`;
  const a=groups.get(key)||[];a.push(i);groups.set(key,a);
 }
 const result=[...groups.entries()].filter(([,a])=>a.length>1).map(([key,a])=>({
  key,count:a.length,sourceSku:a[0].sourceSku||null,title:a[0].title,
  items:a.map(i=>({id:i.id,sku:i.sku,sourceSku:i.sourceSku,title:i.title,quantity:i.quantity,cogs:i.cogs,workflowStatus:i.workflowStatus,dispositionStatus:i.dispositionStatus,unlisted:i.unlisted,createdAt:i.createdAt,saleRefs:i.saleLines.length,saleUnits:i.saleLines.reduce((n,x)=>n+x.quantity,0),listings:i.listings}))
 })).sort((a,b)=>{
  const risk=(g:any)=>g.items.some((i:any)=>i.sku.startsWith("RH-"))&&g.items.some((i:any)=>i.sku.startsWith("FW26-"))?2:g.sourceSku?1:0;
  return risk(b)-risk(a)||b.count-a.count||a.title.localeCompare(b.title);
 });
 return NextResponse.json(result);
}
