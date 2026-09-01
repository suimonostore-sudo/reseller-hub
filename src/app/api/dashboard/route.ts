import {NextResponse} from "next/server";
import {prisma} from "@/src/lib/prisma";

export async function GET(){
  const activeWhere={dispositionStatus:"ACTIVE",quantity:{gt:0}} as const;
  const [active,needsPhotos,photosDone,listed,soldMarked,soldZeroQty,donated,discarded,legacyTrashed,needsMatch] = await Promise.all([
    prisma.inventoryItem.count({where:activeWhere}),
    prisma.inventoryItem.count({where:{...activeWhere,workflowStatus:"NEEDS_PHOTOS"}}),
    prisma.inventoryItem.count({where:{...activeWhere,workflowStatus:"PHOTOS_DONE"}}),
    prisma.inventoryItem.count({where:{...activeWhere,workflowStatus:"LISTED"}}),
    prisma.inventoryItem.count({where:{dispositionStatus:"SOLD"}}),
    prisma.inventoryItem.count({where:{dispositionStatus:"ACTIVE",quantity:{lte:0}}}),
    prisma.inventoryItem.count({where:{dispositionStatus:"DONATED"}}),
    prisma.inventoryItem.count({where:{dispositionStatus:"DISCARDED"}}),
    prisma.inventoryItem.count({where:{dispositionStatus:"TRASHED"}}),
    prisma.sale.count({where:{status:"NEW"}})
  ]);
  return NextResponse.json({active,needsPhotos,photosDone,listed,sold:soldMarked+soldZeroQty,donated,discarded:discarded+legacyTrashed,needsMatch});
}
