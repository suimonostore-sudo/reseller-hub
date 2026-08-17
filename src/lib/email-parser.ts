import { Platform } from "@prisma/client";

function money(v?:string){return v?Number(v.replace(/[$,]/g,"")):0}
function first(text:string,patterns:RegExp[]){for(const p of patterns){const m=text.match(p);if(m?.[1])return m[1].trim()}return ""}
function cleanTitle(v:string){return v.replace(/\s*\.\.\.$/,"").replace(/\s*\([^)]*\)\s*$/," ").trim()}

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
 if(platform===Platform.EBAY) return s.startsWith("you made the sale for ") || /order total|sold for|buyer paid/.test(b);
 if(platform===Platform.DEPOP) return /sale confirmation|it'?s time to ship/.test(s) || /you sold|buyer paid|sale total/.test(b);
 if(platform===Platform.POSHMARK) return /congratulations.*sale|you made a sale|sold/.test(s) || /order total|your earnings|buyer/.test(b);
 if(platform===Platform.MERCARI) return /you made a sale|item sold|sold/.test(s) || /order total|your earnings|buyer/.test(b);
 return false;
}

export function parseMarketplaceSale(platform:Platform,subject:string,body:string){
 const text=`${subject}\n${body}`.replace(/\r/g,"");
 if(!looksLikeSale(platform,subject,body)) return null;

 let title="";
 if(platform===Platform.EBAY){
   title=cleanTitle(first(subject,[/^You made the sale for\s+(.+)$/i]));
 }
 if(platform===Platform.DEPOP){
   title=cleanTitle(first(text,[/(?:item|listing)(?: title)?:\s*([^\n]+)/i,/you sold\s+([^\n]+)/i,/sold item\s*:?\s*([^\n]+)/i]));
 }
 if(!title){
   title=cleanTitle(first(text,[/item(?: title)?:\s*([^\n]+)/i,/you sold[:\s]+([^\n]+)/i,/sold[:\s]+([^\n]+)/i,/listing:\s*([^\n]+)/i]));
 }

 const amount=money(first(text,[
   /(?:order total|sale total|sold for|buyer paid|sale price|order amount|total):?\s*\$?([\d,.]+)/i,
   /(?:you earned|your earnings):?\s*\$?([\d,.]+)/i,
   /\$([\d,.]+)\s+(?:sale|sold)/i
 ]));
 const buyer=first(text,[
   /(?:buyer|sold to|username):\s*@?([^\n<]+)/i,
   /sale confirmation for\s+@?([^\.\n]+)/i,
   /ship to\s+@?([^\n<]+)/i
 ]);
 const order=first(text,[/(?:order|transaction)(?: id| number| #)?:\s*([A-Z0-9-]+)/i]);
 const listing=first(text,[/(?:listing|item)(?: id| number| #):\s*([A-Z0-9-]+)/i,/\((\d{9,})\)\s*$/]);
 const fees=money(first(text,[/(?:fee|fees|selling fee|platform fee):\s*\$?([\d,.]+)/i]));
 const shipping=money(first(text,[/(?:shipping cost|shipping fee|shipping):\s*\$?([\d,.]+)/i]));

 if(!title || amount<=0) return null;
 return {platform,title,saleAmount:amount,buyerUsername:buyer||null,externalOrderId:order||null,externalListingId:listing||null,fees,shippingCost:shipping,quantity:1};
}
