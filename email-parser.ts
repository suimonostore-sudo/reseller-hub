import { Platform } from "@prisma/client";
function money(v?:string){return v?Number(v.replace(/[$,]/g,"")):0}
function first(text:string,patterns:RegExp[]){for(const p of patterns){const m=text.match(p);if(m?.[1])return m[1].trim()}return ""}
export function marketplaceFrom(sender:string,subject:string):Platform|null{
 const s=(sender+" "+subject).toLowerCase();
 if(s.includes("poshmark"))return Platform.POSHMARK;if(s.includes("mercari"))return Platform.MERCARI;if(s.includes("depop"))return Platform.DEPOP;if(s.includes("ebay"))return Platform.EBAY;return null;
}
export function parseMarketplaceSale(platform:Platform,subject:string,body:string){
 const text=`${subject}\n${body}`.replace(/\r/g,"");
 const title=first(text,[/item(?: title)?:\s*(.+)/i,/you sold[:\s]+(.+)/i,/sold[:\s]+(.+)/i]);
 const amount=money(first(text,[/(?:sale|sold|order) (?:price|total|amount):?\s*\$?([\d,.]+)/i,/\$([\d,.]+)\s+(?:sale|sold)/i]));
 const buyer=first(text,[/(?:buyer|sold to|username):\s*@?([^\n]+)/i]);
 const order=first(text,[/(?:order|transaction)(?: id| number| #)?:\s*([A-Z0-9-]+)/i]);
 const listing=first(text,[/(?:listing|item)(?: id| number| #):\s*([A-Z0-9-]+)/i]);
 const fees=money(first(text,[/(?:fee|fees):\s*\$?([\d,.]+)/i]));
 const shipping=money(first(text,[/(?:shipping cost|shipping):\s*\$?([\d,.]+)/i]));
 return {platform,title, saleAmount:amount,buyerUsername:buyer||null,externalOrderId:order||null,externalListingId:listing||null,fees,shippingCost:shipping,quantity:1};
}