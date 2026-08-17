import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

function sanitize(text: string | null) {
  if (!text) return "";
  return text
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{10,}\b/g, "[number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

export async function GET() {
  const rows = await prisma.emailMessage.findMany({
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    take: 100,
    select: { sender: true, subject: true, marketplace: true, parsed: true, receivedAt: true, bodyText: true },
  });

  const saleLike = rows
    .filter((r) => /you made the sale|sale confirmation|sold|it's time to ship/i.test(r.subject))
    .slice(0, 12)
    .map((r) => ({
      sender: r.sender,
      subject: r.subject,
      marketplace: r.marketplace,
      parsed: r.parsed,
      receivedAt: r.receivedAt,
      bodyPreview: sanitize(r.bodyText),
    }));

  return NextResponse.json({ saleLike });
}
