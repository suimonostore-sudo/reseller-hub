import {NextResponse} from "next/server";
import {prisma} from "@/src/lib/prisma";

export async function GET(){
  const [active,needsPhotos,photosDone,listed,sold,donated,discarded,legacyTrashed,needsMatch] = await Promise.all([
    prisma.inventoryItem.count({where:{dispositionStatus:"ACTIVE"}}),
    prisma.inventoryItem.count({where:{dispositionStatus:"ACTIVE",workflowStatus:"NEEDS_PHOTOS"}}),
    prisma.inventoryItem.count({where:{dispositionStatus:"ACTIVE",workflowStatus:"PHOTOS_DONE"}}),
    prisma.inventoryItem.count({where:{dispositionStatus:"ACTIVE",workflowStatus:"LISTED"}}),
    prisma.inventoryItem.count({where:{dispositionStatus:"SOLD"}}),
    prisma.inventoryItem.count({where:{dispositionStatus:"DONATED"}}),
    prisma.inventoryItem.count({where:{dispositionStatus:"DISCARDED"}}),
    prisma.inventoryItem.count({where:{dispositionStatus:"TRASHED"}}),
    prisma.sale.count({where:{status:"NEW"}})
  ]);
  return NextResponse.json({active,needsPhotos,photosDone,listed,sold,donated,discarded:discarded+legacyTrashed,needsMatch});
}
