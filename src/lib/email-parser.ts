import { Platform } from "@prisma/client";

function money(v?:string){return v?Number(v.replace(/[$,]/g,"")):0}
function first(text:string,patterns:RegExp[]){for(const p of patterns){const m=text.match(p);if(m?.[1])return m[1].trim()}return ""}
function cleanTitle(v:string){return v.replace(/^["“]|["”]$/g,"").replace(/\s*\.\.\.$/,"").replace(/\s*\([^)]*\)\s*$/," ").trim()}
function decodeEntities(s:string){
 return s
  .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
  .replace(/&lt;/gi,"<").replace(/&gt;/gi,">")
  .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
}
export function normalizeEmailText(input:string){
 let s=input||"";
 s=s.replace(/<!--[\s\S]*?-->/g," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<br\s*\/?\s*>/gi,"\n")
    .replace(/<\/(p|div|tr|li|td|h[1-6])>/gi,"\n")
    .replace(/<[^>]+>/g," ");
 s=decodeEntities(s)
   .replace(/[\u00ad\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g,"")
   .replace(/&zwnj;/gi,"")
   .replace(/[ \t]+/g," ")
   .replace(/\n\s*\n+/g,"\n")
   .trim();
 return s;
}

export function marketplaceFrom(sender:string,subject:string):Platform|null{
 const s=(sender+" "+subject).toLowerCase();
 if(s.includes("poshmark"))return Platform.POSHMARK;
 if(s.includes("mercari"))return Platform.MERCARI;
 if(s.includes("depop"))return Platform.DEPOP;
 if(s.includes("ebay"))return Platform.EBAY;
 return null;
}

function looksLikeSale(platform:Platform,subject:string,body:string){
 const s=subject.toLowerCase(), b=body.toLowerCase();
 if(platform===Platform.EBAY) return s.startsWith("you made the sale for ") || /sold:\s*\$|buyer paid/.test(b);
 if(platform===Platform.DEPOP) return /sale confirmation/.test(s) || (/you'?ve made a sale|you sold/.test(b) && !/time to ship|shipping reminder|delivered/.test(s));
 if(platform===Platform.POSHMARK) return /just sold to|you made a sale|congratulations.*sale/.test(s) || /you just sold/.test(b);
 if(platform===Platform.MERCARI) return /you made a sale|item sold|congratulations.*sale/.test(s) || /you made a sale|item sold/.test(b);
 return false;
}

function feeAfterLabel(text:string,label:string){
 const clean=text.replace(/https?:\/\/\S+/gi," ");
 const re=new RegExp(label+"[\\s\\S]{0,160}?[−-]\\s*\\$?([\\d,.]+)","i");
 return money(first(clean,[re]));
}

export function parseMarketplaceSale(platform:Platform,subject:string,body:string){
 const normalizedBody=normalizeEmailText(body);
 const text=`${subject}\n${normalizedBody}`.replace(/\r/g,"");
 if(!looksLikeSale(platform,subject,normalizedBody)) return null;

 let title="";
 if(platform===Platform.EBAY){
   title=cleanTitle(first(subject,[/^You made the sale for\s+(.+)$/i]));
   if(!title) title=cleanTitle(first(normalizedBody,[/(?:item|listing)(?: title)?:\s*([^\n]+)/i]));
 }
 if(platform===Platform.DEPOP){
   title=cleanTitle(first(normalizedBody,[
     /order details\s+(?:image\s+)?(.+?)\s+Size:/i,
     /order details\s+(?:image\s+)?(.+?)\s+\$[\d,.]+/i,
     /(?:item|listing)(?: title)?:\s*([^\n]+)/i,
     /you sold\s+([^\n]+)/i,
     /sold item\s*:?\s*([^\n]+)/i
   ]));
 }
 if(platform===Platform.POSHMARK){
   title=cleanTitle(first(subject,[/^["“](.+?)["”]\s+just sold to\s+@/i]));
   if(!title) title=cleanTitle(first(normalizedBody,[/you just sold\s+["“](.+?)["”]\s+on poshmark/i,/item price\s+(.+?)\s+size:/i]));
 }
 if(platform===Platform.MERCARI){
   title=cleanTitle(first(text,[
     /(?:item|item name|listing|listing title)(?: title)?:\s*([^\n]+)/i,
     /you sold\s+["“]?([^\n"”]+)["”]?/i,
     /sold\s+["“]([^"”]+)["”]/i,
     /sale details[\s\S]{0,120}?([^\n]+?)\s+\$[\d,.]+/i
   ]));
 }
 if(!title){
   title=cleanTitle(first(text,[/item(?: title)?:\s*([^\n]+)/i,/you sold[:\s]+([^\n]+)/i,/sold[:\s]+([^\n]+)/i,/listing:\s*([^\n]+)/i]));
 }

 const amount=money(first(text,[
   /sold:\s*\$?([\d,.]+)/i,
   /item price\s*\$?([\d,.]+)/i,
   /sale price\s*:?\s*\$?([\d,.]+)/i,
   /order details[\s\S]{0,180}?\$([\d,.]+)/i,
   /(?:order total|sale total|sold for|buyer paid|order amount|total):?\s*\$?([\d,.]+)/i,
   /(?:you earned|your earnings|you'll earn|you’ll earn):?\s*\$?([\d,.]+)/i,
   /(?:price):?\s*\$?([\d,.]+)/i,
   /\$([\d,.]+)\s+(?:sale|sold)/i
 ]));
 const buyer=first(text,[
   /just sold to\s+@([^\s]+)\s+on poshmark/i,
   /buyer:\s*@?([^\n<]+?)(?=\s+Quantity sold:|\n|$)/i,
   /buyer info\s+(?:[a-z]\s+)?@?([^\s]+)/i,
   /buyer\s+(?:buyer profile picture\s+)?[a-z]\s+@?([A-Za-z0-9_.-]+)\s+image/i,
   /buyer\s+buyer profile picture\s+@?([A-Za-z0-9_.-]+)\s+image/i,
   /(?:sold to|username):\s*@?([^\n<]+)/i,
   /sale confirmation for\s+@?([^\.\n]+)/i,
   /show\s+@([^\s]+)\s+some\s+5-star/i
 ]);
 const order=first(text,[
   /order id\s*([A-Z0-9-]+)/i,
   /order:\s*([0-9-]+)/i,
   /(?:order|transaction)(?: id| number| #)?:\s*([A-Z0-9-]+)/i
 ]);
 const listing=first(text,[/(?:listing|item)(?: id| number| #):\s*([A-Z0-9-]+)/i,/\((\d{9,})\)\s*$/]);
 const sku=first(text,[
   /\bSKU\s*:\s*([^\n]+?)(?=\s+\$[\d,.]+|\s+Your Earnings|\s+Order|\n|$)/i,
   /\bSeller SKU\s*:\s*([^\n]+)/i
 ]);
 const processingFee=feeAfterLabel(text,"payment processing fee");
 const boostingFee=feeAfterLabel(text,"boosting fee");
 const genericFee=money(first(text,[/(?:fee|fees|selling fee|platform fee):\s*\$?([\d,.]+)/i]));
 const fees=(processingFee||boostingFee)?processingFee+boostingFee:genericFee;
 const shipping=money(first(text,[
   /shipping:\s*\$?([\d,.]+)/i,
   /(?:shipping cost|shipping fee):\s*\$?([\d,.]+)/i
 ]));

 if(!title || amount<=0) return null;
 return {platform,title,saleAmount:amount,buyerUsername:buyer||null,externalOrderId:order||null,externalListingId:listing||null,sku:sku||null,fees,shippingCost:shipping,quantity:1};
}
