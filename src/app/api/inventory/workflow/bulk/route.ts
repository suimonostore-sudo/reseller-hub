import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

const allowed = new Set(["NEEDS_PHOTOS", "PHOTOS_DONE", "LISTED"]);

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.map((x: unknown) => Number(x)).filter((x: number) => Number.isInteger(x) && x > 0))]
    : [];
  const status = String(body.workflowStatus || "").toUpperCase();

  if (!ids.length) return NextResponse.json({ error: "Select at least one inventory item." }, { status: 400 });
  if (!allowed.has(status)) return NextResponse.json({ error: "Invalid workflow status." }, { status: 400 });

  const existing = await prisma.inventoryItem.findMany({
    where: { id: { in: ids }, dispositionStatus: "ACTIVE" },
    select: { id: true, listDate: true },
  });
  const activeIds = existing.map(x => x.id);
  if (!activeIds.length) return NextResponse.json({ error: "No active inventory items were selected." }, { status: 400 });

  const now = new Date();
  const result = await prisma.$transaction(async tx => {
    const updated = await tx.inventoryItem.updateMany({
      where: { id: { in: activeIds } },
      data: {
        workflowStatus: status,
        unlisted: status !== "LISTED",
      },
    });

    if (status === "LISTED") {
      const missingListDate = existing.filter(x => !x.listDate).map(x => x.id);
      if (missingListDate.length) {
        await tx.inventoryItem.updateMany({
          where: { id: { in: missingListDate } },
          data: { listDate: now },
        });
      }
    }
    return updated.count;
  });

  return NextResponse.json({ ok: true, updated: result, workflowStatus: status });
}
