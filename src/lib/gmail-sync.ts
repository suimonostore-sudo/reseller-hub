import { prisma } from "./prisma";
import { gmailJson,messageText } from "./gmail";
import { marketplaceFrom,parseMarketplaceSale } from "./email-parser";
import { ingestSale } from "./sale-ingest";

async function processStoredEmail(email:any){
  if(!email.marketplace || email.parsed) return false;
  const data=parseMarketplaceSale(email.marketplace,email.subject||"",email.bodyText||"");
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
