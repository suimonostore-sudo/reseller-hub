import { prisma } from "./prisma";
import { gmailJson,messageText } from "./gmail";
import { marketplaceFrom,parseMarketplaceSale } from "./email-parser";
import { ingestSale } from "./sale-ingest";
import { Platform } from "@prisma/client";

function cleanTitle(s:string){return s.replace(/\.$/,"").trim();}
function amountFromMercariOffer(body:string){const m=body.match(/received an offer of\s*\$([\d,.]+)/i);return m?Number(m[1].replace(/,/g,"")):0;}

async function mercariFallback(email:any){
  if(email.marketplace!==Platform.MERCARI) return null;
  const subject=email.subject||"";
  const m=subject.match(/^Your item is on its way:\s*(.+)$/i);
  if(!m) return null;
  const title=cleanTitle(m[1]);
  const received=email.receivedAt?new Date(email.receivedAt):new Date();
  const from=new Date(received.getTime()-72*60*60*1000);
  const prior=await prisma.emailMessage.findMany({
    where:{marketplace:Platform.MERCARI,receivedAt:{gte:from,lte:received},subject:{startsWith:"You’ve received an offer for"}},
    orderBy:{receivedAt:"desc"},take:25
  });
  for(const p of prior){
    const ps=(p.subject||"").match(/^You’ve received an offer for\s*(.+?)\.?$/i);
    if(!ps || cleanTitle(ps[1]).toLowerCase()!==title.toLowerCase()) continue;
    const amount=amountFromMercariOffer(p.bodyText||"");
    if(amount>0) return {platform:Platform.MERCARI,title,saleAmount:amount,buyerUsername:null,externalOrderId:null,externalListingId:null,sku:null,fees:0,shippingCost:0,quantity:1};
  }
  return null;
}

async function processStoredEmail(email:any){
  if(!email.marketplace || email.parsed) return false;
  let data=parseMarketplaceSale(email.marketplace,email.subject||"",email.bodyText||"");
  if(!data) data=await mercariFallback(email);
  if(!data) return false;
  const result=await ingestSale({...data,sourceEmailId:email.messageId,ingestionKey:`GMAIL|${email.messageId}`,soldAt:email.receivedAt||undefined});
  if(result?.error) return false;
  await prisma.emailMessage.update({where:{messageId:email.messageId},data:{parsed:true,processedAt:new Date()}});
  return true;
}

export async function syncGmail(){
 const run=await prisma.syncRun.create({data:{source:"gmail",status:"RUNNING"}});
 let found=0,parsed=0,reprocessed=0;
 try{
  const pending=await prisma.emailMessage.findMany({where:{parsed:false,marketplace:{not:null}},orderBy:{receivedAt:"desc"},take:500});
  for(const email of pending){if(await processStoredEmail(email)){parsed++;reprocessed++;}}

  const list=await gmailJson("messages?q="+encodeURIComponent("newer_than:30d (from:poshmark OR from:mercari OR from:depop OR from:ebay)")+"&maxResults=500");
  for(const m of list.messages||[]){
   const existing=await prisma.emailMessage.findUnique({where:{messageId:m.id}});
   if(existing){
    if(await processStoredEmail(existing)) parsed++;
    continue;
   }
   const full=await gmailJson(`messages/${m.id}?format=full`), headers=full.payload?.headers||[];
   const h=(name:string)=>headers.find((x:any)=>x.name?.toLowerCase()===name)?.value||"";
   const sender=h("from"),subject=h("subject"),marketplace=marketplaceFrom(sender,subject),body=messageText(full.payload);
   const receivedAt=full.internalDate?new Date(Number(full.internalDate)):new Date();
   const created=await prisma.emailMessage.create({data:{messageId:m.id,threadId:full.threadId||null,sender,subject,receivedAt,snippet:full.snippet||null,bodyText:body,marketplace}});
   found++;
   if(await processStoredEmail(created)) parsed++;
  }
  await prisma.syncRun.update({where:{id:run.id},data:{finishedAt:new Date(),status:"SUCCESS",itemsFound:found,message:`${parsed} sales parsed (${reprocessed} from existing emails)`}});
  return {found,parsed,reprocessed};
 }catch(e:any){
  await prisma.syncRun.update({where:{id:run.id},data:{finishedAt:new Date(),status:"ERROR",itemsFound:found,message:e.message}});
  throw e;
 }
}
