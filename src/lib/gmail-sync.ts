import { prisma } from "./prisma";
import { gmailJson,messageText } from "./gmail";
import { marketplaceFrom,parseMarketplaceSale } from "./email-parser";
import { ingestSale } from "./sale-ingest";

export async function syncGmail(){
 const run=await prisma.syncRun.create({data:{source:"gmail",status:"RUNNING"}});
 let found=0,parsed=0;
 try{
  const list=await gmailJson("messages?q="+encodeURIComponent("newer_than:30d (from:poshmark OR from:mercari OR from:depop OR from:ebay)")+"&maxResults=100");
  for(const m of list.messages||[]){
   if(await prisma.emailMessage.findUnique({where:{messageId:m.id}}))continue;
   const full=await gmailJson(`messages/${m.id}?format=full`), headers=full.payload?.headers||[];
   const h=(name:string)=>headers.find((x:any)=>x.name?.toLowerCase()===name)?.value||"";
   const sender=h("from"),subject=h("subject"),marketplace=marketplaceFrom(sender,subject),body=messageText(full.payload);
   const receivedAt=full.internalDate?new Date(Number(full.internalDate)):new Date();
   await prisma.emailMessage.create({data:{messageId:m.id,threadId:full.threadId||null,sender,subject,receivedAt,snippet:full.snippet||null,bodyText:body,marketplace}});
   found++;
   if(!marketplace)continue;
   const data=parseMarketplaceSale(marketplace,subject,body);
   if(data.title && data.saleAmount>0){
    await ingestSale({...data,sourceEmailId:m.id,ingestionKey:`GMAIL|${m.id}`});
    await prisma.emailMessage.update({where:{messageId:m.id},data:{parsed:true,processedAt:new Date()}});
    parsed++;
   }
  }
  await prisma.syncRun.update({where:{id:run.id},data:{finishedAt:new Date(),status:"SUCCESS",itemsFound:found,message:`${parsed} sales parsed`}});
  return {found,parsed};
 }catch(e:any){
  await prisma.syncRun.update({where:{id:run.id},data:{finishedAt:new Date(),status:"ERROR",itemsFound:found,message:e.message}});
  throw e;
 }
}