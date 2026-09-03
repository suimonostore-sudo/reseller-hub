import {NextRequest,NextResponse} from "next/server";
import {inflateRawSync} from "zlib";
import {createHash} from "crypto";
import {prisma} from "@/src/lib/prisma";

type Row={p?:string;ls?:string;sd?:string;ld?:string;ed?:string;loc?:string;c?:number|null;st?:string;pd?:string;dn?:string;dd?:string;lt?:string;lp?:number|null;n?:string;cs?:string;qp?:number;ql?:number;qs?:number;qr?:number;eb?:string};
const clean=(v:any)=>String(v??"").trim();
const norm=(v:any)=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
const day=(v:any)=>{const s=clean(v);return s?s.slice(0,10):""};
const money=(v:any)=>v==null||v===""?null:Number(v);
const makeSku=(r:Row)=>"FW26-"+createHash("sha1").update([r.p,r.pd,r.c,r.cs,r.eb,r.loc].map(clean).join("|")).digest("hex").slice(0,14).toUpperCase();

export async function GET(req:NextRequest){
 try{
  const d=req.nextUrl.searchParams.get("d");
  if(!d)return NextResponse.json({error:"Missing data"},{status:400});
  const rows:Row[]=JSON.parse(inflateRawSync(Buffer.from(d,"base64url")).toString("utf8"));
  if(!Array.isArray(rows)||rows.length>150)return NextResponse.json({error:"Invalid batch"},{status:400});

  const existing=await prisma.inventoryItem.findMany({select:{id:true,sku:true,sourceSku:true,title:true,cogs:true,purchaseDate:true,purchaseStore:true,location:true,listings:{select:{externalId:true,platform:true}}}});
  const bySku=new Map<string,number[]>(),bySource=new Map<string,number[]>(),byEbay=new Map<string,number[]>(),byTdc=new Map<string,number[]>(),byTds=new Map<string,number[]>();
  const add=(m:Map<string,number[]>,k:string,id:number)=>{if(!k)return;const a=m.get(k)||[];if(!a.includes(id))a.push(id);m.set(k,a)};
  for(const x of existing){
   add(bySku,clean(x.sku),x.id); add(bySource,clean(x.sourceSku),x.id);
   for(const l of x.listings||[])if(String(l.platform)==="EBAY")add(byEbay,clean(l.externalId),x.id);
   const t=norm(x.title),pd=day(x.purchaseDate?.toISOString()),c=x.cogs==null?"":Number(x.cogs).toFixed(2),s=norm(x.purchaseStore);
   if(t&&pd&&c)add(byTdc,`${t}|${pd}|${c}`,x.id);
   if(t&&pd&&s)add(byTds,`${t}|${pd}|${s}`,x.id);
  }

  let imported=0,duplicates=0,ambiguous=0,failed=0; const details:any[]=[];
  for(const r of rows){
   try{
    const cs=clean(r.cs),eb=clean(r.eb),t=norm(r.p),pd=day(r.pd),c=money(r.c),s=norm(r.st);
    const ebayHits=eb?(byEbay.get(eb)||[]):[];
    if(ebayHits.length===1){duplicates++;continue}
    if(ebayHits.length>1){ambiguous++;details.push({product:r.p,customSku:r.cs,ebayItemId:r.eb,reason:"duplicate ebay id",matches:ebayHits});continue}

    const composite=new Set<number>();
    if(t&&pd&&c!=null)for(const id of byTdc.get(`${t}|${pd}|${Number(c).toFixed(2)}`)||[])composite.add(id);
    if(t&&pd&&s)for(const id of byTds.get(`${t}|${pd}|${s}`)||[])composite.add(id);
    if(composite.size===1){duplicates++;continue}
    if(composite.size>1){ambiguous++;details.push({product:r.p,customSku:r.cs,ebayItemId:r.eb,reason:"composite match",matches:[...composite]});continue}

    // Flipwise often reused one custom SKU across a whole purchase batch. A new eBay item ID is
    // therefore stronger evidence of a distinct item than a repeated source SKU.
    if(!eb){
      const skuHits=new Set<number>();
      if(cs){for(const id of bySku.get(cs)||[])skuHits.add(id);for(const id of bySource.get(cs)||[])skuHits.add(id)}
      if(skuHits.size===1){duplicates++;continue}
      if(skuHits.size>1){ambiguous++;details.push({product:r.p,customSku:r.cs,reason:"reused sku",matches:[...skuHits]});continue}
    }

    let sku=makeSku(r),suffix=1;
    while(await prisma.inventoryItem.findUnique({where:{sku},select:{id:true}})){sku=`${makeSku(r)}-${suffix++}`}
    const donated=clean(r.dn),discarded=clean(r.dd); const qty=Math.max(0,Number(r.qr??r.qp??1)||0);
    const item=await prisma.inventoryItem.create({data:{
      sku,sourceSku:cs||null,title:clean(r.p)||"Untitled Flipwise item",quantity:qty,
      unlisted:!clean(r.ld),workflowStatus:clean(r.ld)?"LISTED":"NEEDS_PHOTOS",
      dispositionStatus:discarded?"TRASHED":donated?"DONATED":"ACTIVE",
      disposedAt:discarded?new Date(discarded):donated?new Date(donated):null,
      dispositionNote:clean(r.n)||null,cogs:c,location:clean(r.loc)||null,purchaseStore:clean(r.st)||null,
      purchaseDate:pd?new Date(pd+"T12:00:00Z"):null,listDate:clean(r.ld)?new Date(day(r.ld)+"T12:00:00Z"):null,listPrice:money(r.lp)
    }});
    if(eb){await prisma.listing.create({data:{platform:"EBAY",externalId:eb,title:item.title,quantity:Math.max(1,Number(r.ql||r.qp||1)||1),active:qty>0,inventoryItemId:item.id}})}
    imported++;
    add(bySku,sku,item.id);if(cs)add(bySource,cs,item.id);if(eb)add(byEbay,eb,item.id);
    if(t&&pd&&c!=null)add(byTdc,`${t}|${pd}|${Number(c).toFixed(2)}`,item.id);if(t&&pd&&s)add(byTds,`${t}|${pd}|${s}`,item.id);
   }catch(e:any){failed++;details.push({product:r.p,error:e?.message||String(e)})}
  }
  return NextResponse.json({rows:rows.length,imported,duplicates,ambiguous,failed,details:details.slice(0,20)});
 }catch(e:any){return NextResponse.json({error:e?.message||String(e)},{status:500})}
}
