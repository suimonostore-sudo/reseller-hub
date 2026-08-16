import {NextResponse} from "next/server";
import {prisma} from "@/src/lib/prisma";

export async function GET(){
  const [inventory,listings,sales,needsMatch,readyToPick,labels,bulk] = await Promise.all([
    prisma.inventoryItem.count(),
    prisma.listing.count(),
    prisma.sale.count(),
    prisma.sale.count({where:{status:"NEW"}}),
    prisma.sale.count({where:{status:"MATCHED"}}),
    prisma.shippingLabel.count(),
    prisma.bulkBuy.findMany({include:{items:true}})
  ]);
  const unlisted = bulk.reduce((total,b)=>{
    const assigned=b.items.reduce((sum,i)=>sum+i.quantity,0);
    return total+Math.max(0,b.purchasedQty-assigned);
  },0);
  return NextResponse.json({inventory,listings,sales,needsMatch,readyToPick,labels,unlisted});
}
