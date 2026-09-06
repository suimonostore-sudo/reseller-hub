import {NextRequest,NextResponse} from "next/server";
import {connectNifty} from "@/src/lib/niftyMcp";
import {prisma} from "@/src/lib/prisma";
import {Platform,SaleStatus} from "@prisma/client";

const norm=(s:any)=>String(s||"").trim().toLowerCase().replace(/\s+/g," ");
const num=(...v:any[])=>{for(const x of v){if(x===null||x===undefined||x==="")continue;const n=Number(x);if(Number.isFinite(n))return n}return 0};
const optionalNum=(...v:any[]):number|null=>{for(const x of v){if(x===null||x===undefined||x==="")continue;const n=Number(x);if(Number.isFinite(n))return n}return null};

function platform(v:any):Platform|null{
  const s=norm(v).replace(/\s/g,"");
  if(s==="ebay")return Platform.EBAY;
  if(s==="poshmark")return Platform.POSHMARK;
  if(s==="mercari")return Platform.MERCARI;
  if(s==="depop")return Platform.DEPOP;
  return null;
}
function jsonFromResult(r:any){if(r?.structuredContent)return r.structuredContent;for(const c of r?.content||[])if(c?.type==="text")try{return JSON.parse(c.text)}catch{}return null}
function ordersFrom(v:any):any[]{if(Array.isArray(v))return v;for(const k of ["orders","results","items","data"])if(Array.isArray(v?.[k]))return v[k];return []}
function pick(o:any,...keys:string[]){for(const k of keys)if(o?.[k]!=null)return o[k]}
function linesFrom(o:any):any[]{for(const k of ["items","lineItems","line_items"])if(Array.isArray(o?.[k])&&o[k].length)return o[k];return [o]}

async function matchItem(sku:string,title:string,preferredItemId?:number|null){
  if(!sku)return {item:null,ambiguous:false,matches:[] as any[]};
  const rows=await prisma.inventoryItem.findMany({where:{sourceSku:{equals:sku,mode:"insensitive"}},orderBy:[{createdAt:"asc"},{id:"asc"}]});
  if(preferredItemId){const preferred=rows.find(x=>x.id===preferredItemId);if(preferred)return {item:preferred,ambiguous:false,matches:rows}}
  if(rows.length===1)return {item:rows[0],ambiguous:false,matches:rows};
  const exact=rows.filter(x=>norm(x.title)===norm(title));
  if(exact.length===1)return {item:exact[0],ambiguous:false,matches:exact};
  const pool=exact.length?exact:rows;
  if(pool.length>1){
    const available=pool.filter(x=>Number(x.quantity)>0&&norm(x.dispositionStatus)!=="sold").sort((a,b)=>a.id-b.id);
    const availableOriginals=available.filter(x=>/^RH-\d+$/i.test(x.sku));
    if(availableOriginals.length)return {item:availableOriginals[0],ambiguous:false,matches:pool};
    if(available.length)return {item:available[0],ambiguous:false,matches:pool};
    const originals=pool.filter(x=>/^RH-\d+$/i.test(x.sku)).sort((a,b)=>a.id-b.id);
    if(originals.length)return {item:originals[0],ambiguous:false,matches:pool};
    const ordered=[...pool].sort((a,b)=>a.id-b.id);
    return {item:ordered[0],ambiguous:false,matches:pool};
  }
  return {item:null,ambiguous:false,matches:pool};
}
async function nextSku(db:any=prisma){const rows=await db.inventoryItem.findMany({where:{sku:{startsWith:"RH-"}},select:{sku:true}});let n=0;for(const r of rows){const m=/^RH-(\d+)$/i.exec(r.sku);if(m)n=Math.max(n,Number(m[1]))}return `RH-${String(n+1).padStart(6,"0")}`}
async function findExistingSale(db:any,p:Platform,external:string,itemIds:number[],soldAt:Date,ingestionKey:string){
  const byExternal=await db.sale.findFirst({where:{platform:p,externalOrderId:external},orderBy:{createdAt:"asc"}});if(byExternal)return byExternal;
  const byKey=await db.sale.findUnique({where:{ingestionKey}});if(byKey)return byKey;
  const from=new Date(soldAt.getTime()-5*60*1000),to=new Date(soldAt.getTime()+5*60*1000);
  const candidates=await db.sale.findMany({where:{platform:p,soldAt:{gte:from,lte:to},lines:{some:{inventoryItemId:{in:itemIds}}}},include:{lines:true},orderBy:{createdAt:"asc"}});
  if(candidates.length===1)return candidates[0];
  const allItemMatches=candidates.filter((s:any)=>itemIds.every(id=>s.lines.some((l:any)=>l.inventoryItemId===id)));
  return allItemMatches.length===1?allItemMatches[0]:null;
}
async function claimIngestionKey(db:any,saleId:number,ingestionKey:string){const owner=await db.sale.findUnique({where:{ingestionKey}});if(owner&&owner.id!==saleId)return owner;return null}

function quantityByItem(lines:{inventoryItemId:number|null,quantity:number}[]){
  const out=new Map<number,number>();
  for(const l of lines){if(l.inventoryItemId==null)continue;out.set(l.inventoryItemId,(out.get(l.inventoryItemId)||0)+Math.max(0,Number(l.quantity)||0))}
  return out;
}
async function applyInventoryDelta(db:any,itemId:number,delta:number,soldAt:Date,p:Platform){
  if(!delta)return;
  const item=await db.inventoryItem.findUnique({where:{id:itemId}});
  if(!item)return;
  if(delta>0){
    const remaining=Math.max(0,Number(item.quantity||0)-delta);
    const data:any={quantity:remaining};
    if(remaining===0){data.dispositionStatus="SOLD";data.disposedAt=soldAt;data.dispositionNote=`Sold via Nifty ${String(p)}`;data.unlisted=true}
    else if(norm(item.dispositionStatus)==="sold"){data.dispositionStatus="ACTIVE";data.disposedAt=null}
    await db.inventoryItem.update({where:{id:itemId},data});
    return;
  }
  const remaining=Number(item.quantity||0)+Math.abs(delta);
  const data:any={quantity:remaining};
  if(remaining>0&&norm(item.dispositionStatus)==="sold"){data.dispositionStatus="ACTIVE";data.disposedAt=null}
  await db.inventoryItem.update({where:{id:itemId},data});
}

export async function POST(req:NextRequest){
  const started=new Date();
  let found=0,synced=0,created=0,ambiguous=0,skipped=0;
  const ambiguousDetails:any[]=[];
  let client:any=null;
  try{
    const connected=await connectNifty(req.nextUrl.origin);
    client=connected.client;
    if(connected.authorizationUrl)throw new Error("Nifty authorization required: reconnect Nifty OAuth");
    const end=new Date(),start=new Date(end.getTime()-7*86400000);
    let all:any[]=[];
    for(let page=0;page<20;page++){
      const result=await client.callTool({name:"search_orders",arguments:{startDate:start.toISOString().replace("Z",""),endDate:end.toISOString().replace("Z",""),sort:"sold_at",sortOrder:"desc",page,limit:50}});
      if(result?.isError)throw new Error(`Nifty search_orders returned an MCP tool error: ${JSON.stringify(result?.content||result).slice(0,1500)}`);
      const payload=jsonFromResult(result),batch=ordersFrom(payload);all.push(...batch);
      if(payload?.hasMore===false)break;
      if(payload?.hasMore==null&&batch.length<50)break;
    }
    found=all.length;
    for(const o of all){
      const external=String(pick(o,"externalMarketplaceOrderId","external_marketplace_order_id","externalOrderId","external_order_id","orderId","order_id")||"").trim();
      const p=platform(pick(o,"marketplace","platform"));
      const status=norm(pick(o,"status","orderStatus","order_status"));
      if(!external||!p){skipped++;continue}
      const ingestionKey=`nifty:${String(p).toLowerCase()}:${external}`;
      const boundSale=await prisma.sale.findFirst({where:{OR:[{platform:p,externalOrderId:external},{ingestionKey}]},include:{lines:{orderBy:{id:"asc"}}},orderBy:{createdAt:"asc"}});
      if(status.includes("cancel")){
        await prisma.$transaction(async tx=>{
          const current=await tx.sale.findFirst({where:{OR:[{platform:p,externalOrderId:external},{ingestionKey}]},include:{lines:{orderBy:{id:"asc"}}},orderBy:{createdAt:"asc"}});
          const cancelledAt=new Date(pick(o,"soldAt","sold_at")||Date.now());
          if(current){
            if(current.status!==SaleStatus.CANCELLED){
              const prior=quantityByItem(current.lines);
              for(const [itemId,qty] of prior)await applyInventoryDelta(tx,itemId,-qty,cancelledAt,p);
            }
            await tx.sale.update({where:{id:current.id},data:{externalOrderId:external,ingestionKey,status:SaleStatus.CANCELLED}});
          }else await tx.sale.create({data:{platform:p,externalOrderId:external,ingestionKey,saleAmount:0,status:SaleStatus.CANCELLED,soldAt:cancelledAt}});
        });
        continue;
      }

      const rawLines=linesFrom(o);
      const matched:any[]=[];
      const pendingCreates:any[]=[];
      let orderAmbiguous=false,orderUnmatched=false;
      for(let lineIndex=0;lineIndex<rawLines.length;lineIndex++){
        const line=rawLines[lineIndex];
        const sku=String(pick(line,"sku","SKU")||pick(o,"sku","SKU")||"").trim();
        const title=String(pick(line,"title","itemTitle","item_title","name")||pick(o,"title","itemTitle","item_title")||"").trim();
        const sameTitle=boundSale?.lines?.filter((x:any)=>norm(x.title)===norm(title))||[];
        const preferredItemId=(sameTitle.length===1?sameTitle[0]?.inventoryItemId:boundSale?.lines?.[lineIndex]?.inventoryItemId)??null;
        const result=await matchItem(sku,title,preferredItemId);
        if(result.ambiguous){
          orderAmbiguous=true;
          ambiguousDetails.push({externalOrderId:external,platform:String(p),sku,title,candidateCount:result.matches.length,candidates:result.matches.slice(0,10).map((x:any)=>({id:x.id,sku:x.sku,sourceSku:x.sourceSku,title:x.title,dispositionStatus:x.dispositionStatus,workflowStatus:x.workflowStatus,quantity:x.quantity}))});
          break;
        }
        const lineCogs=optionalNum(pick(line,"cogs","cost","costOfGoods","cost_of_goods"));
        const linePrice=num(pick(line,"salePrice","sale_price","price","saleAmount","sale_amount"));
        const qty=Math.max(1,Math.trunc(num(pick(line,"quantity","qty"))||1));
        if(result.item)matched.push({item:result.item,title:title||result.item.title,lineCogs,linePrice,qty});
        else if(sku&&title)pendingCreates.push({sku,title,lineCogs,linePrice,qty});
        else {orderUnmatched=true;break}
      }
      if(orderAmbiguous){ambiguous++;continue}
      if(orderUnmatched||matched.length+pendingCreates.length!==rawLines.length||rawLines.length===0){skipped++;continue}

      const soldAt=new Date(pick(o,"soldAt","sold_at")||Date.now());
      const lineTotal=matched.reduce((s,x)=>s+x.linePrice*x.qty,0)+pendingCreates.reduce((s,x)=>s+x.linePrice*x.qty,0);
      const itemPrice=num(pick(o,"salePrice","sale_price","saleAmount","sale_amount","subtotal","total"),lineTotal);
      const collectedShipping=num(pick(o,"collectedShipping","collected_shipping"));
      const refund=num(pick(o,"refundAmount","refund_amount"));
      const saleAmount=itemPrice+collectedShipping-refund;
      const fees=num(pick(o,"sellerPlatformFee","seller_platform_fee","platformFee","platform_fee"))+num(pick(o,"sellerTransactionFee","seller_transaction_fee","transactionFee","transaction_fee","fees"))+num(pick(o,"sellerPromotedFee","seller_promoted_fee","promotedFee","promoted_fee"))+num(pick(o,"shippingExpenses","shipping_expenses"))+num(pick(o,"otherExpenses","other_expenses"));
      const rawShipping=optionalNum(pick(o,"sellerShippingFee","seller_shipping_fee","shippingCost","shipping_cost"));
      const shipping=p===Platform.EBAY?(rawShipping!=null&&rawShipping>0?rawShipping:null):(rawShipping??0);

      const createdThisOrder=await prisma.$transaction(async tx=>{
        const txMatched=[...matched];
        let txCreated=0;
        for(const m of pendingCreates){
          const item=await tx.inventoryItem.create({data:{sku:await nextSku(tx),sourceSku:m.sku,title:m.title,cogs:m.lineCogs,quantity:0,unlisted:true,workflowStatus:"LISTED",dispositionStatus:"SOLD",disposedAt:soldAt,dispositionNote:`Sold via Nifty ${String(p)}`}});
          txCreated++;
          txMatched.push({item,title:m.title,lineCogs:m.lineCogs,linePrice:m.linePrice,qty:m.qty});
        }

        let existing=await findExistingSale(tx,p,external,txMatched.map(x=>x.item.id),soldAt,ingestionKey);
        const data={platform:p,externalOrderId:external,ingestionKey,matchMethod:txMatched.length>1?"NIFTY_BUNDLE_SKU_EXACT":"NIFTY_SKU_EXACT",matchConfidence:1,saleAmount,fees,shippingCost:shipping,status:SaleStatus.MATCHED,soldAt};
        if(existing){const keyOwner=await claimIngestionKey(tx,existing.id,ingestionKey);if(keyOwner)existing=keyOwner}
        const priorLines=existing?await tx.saleLine.findMany({where:{saleId:existing.id}}):[];
        const priorByItem=existing?.status===SaleStatus.CANCELLED?new Map<number,number>():quantityByItem(priorLines);
        const sale=existing?await tx.sale.update({where:{id:existing.id},data}):await tx.sale.create({data});
        await tx.saleLine.deleteMany({where:{saleId:sale.id}});
        for(const m of txMatched)await tx.saleLine.create({data:{saleId:sale.id,inventoryItemId:m.item.id,title:m.title,quantity:m.qty,unitPrice:m.linePrice,cogsAtSale:m.lineCogs??m.item.cogs}});

        const newByItem=quantityByItem(txMatched.map(m=>({inventoryItemId:m.item.id,quantity:m.qty})));
        const itemIds=new Set<number>([...priorByItem.keys(),...newByItem.keys()]);
        for(const itemId of itemIds){
          const delta=(newByItem.get(itemId)||0)-(priorByItem.get(itemId)||0);
          await applyInventoryDelta(tx,itemId,delta,soldAt,p);
        }
        return txCreated;
      });
      created+=createdThisOrder;
      synced++;
    }
    await prisma.syncRun.create({data:{source:"nifty",startedAt:started,finishedAt:new Date(),status:"SUCCESS",itemsFound:found,message:`Synced ${synced}; created ${created}; ambiguous ${ambiguous}; skipped ${skipped}.`}});
    await client?.close().catch(()=>{});
    return NextResponse.json({ok:true,found,synced,created,ambiguous,skipped,ambiguousDetails:ambiguousDetails.slice(0,20)});
  }catch(e:any){
    console.error("[nifty-sync] FAILED",{name:e?.name,message:e?.message,code:e?.code,data:e?.data,cause:e?.cause,stack:e?.stack,found,synced,created,ambiguous,skipped,ambiguousDetails});
    await client?.close?.().catch(()=>{});
    await prisma.syncRun.create({data:{source:"nifty",startedAt:started,finishedAt:new Date(),status:"ERROR",itemsFound:found,message:String(e?.message||e).slice(0,1000)}}).catch(()=>{});
    return NextResponse.json({ok:false,error:String(e?.message||e),errorName:e?.name||null,errorCode:e?.code||null,ambiguousDetails:ambiguousDetails.slice(0,20)},{status:500});
  }
}
