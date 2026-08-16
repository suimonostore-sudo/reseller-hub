import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export async function GET() {
  const rows = await prisma.emailMessage.findMany({
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    take: 50,
    select: { sender: true, subject: true, marketplace: true, parsed: true, receivedAt: true },
  });
  return NextResponse.json({ rows });
}
