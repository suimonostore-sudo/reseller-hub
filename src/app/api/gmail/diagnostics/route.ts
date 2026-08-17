import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { normalizeEmailText } from "@/src/lib/email-parser";

function sanitize(text: string | null) {
  if (!text) return "";
  return text
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{10,}\b/g, "[number]")
    .replace(/\s+/g, " ")
    .trim();
}

function focus(text: string | null) {
  const clean = sanitize(normalizeEmailText(text ?? ""));
  const needles = ["$", "total", "paid", "price", "earn", "sold", "sale", "order", "ship"];
  const parts: string[] = [];
  for (const needle of needles) {
    let at = clean.toLowerCase().indexOf(needle);
    if (at >= 0) {
      const start = Math.max(0, at - 120);
      const end = Math.min(clean.length, at + 260);
      parts.push(clean.slice(start, end));
    }
  }
  return [...new Set(parts)].slice(0, 6);
}

export async function GET() {
  const rows = await prisma.emailMessage.findMany({
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    take: 150,
    select: { sender: true, subject: true, marketplace: true, parsed: true, receivedAt: true, bodyText: true },
  });

  const saleLike = rows
    .filter((r) => /you made the sale|sale confirmation|sold|it's time to ship/i.test(r.subject ?? ""))
    .slice(0, 20)
    .map((r) => ({
      sender: r.sender,
      subject: r.subject,
      marketplace: r.marketplace,
      parsed: r.parsed,
      receivedAt: r.receivedAt,
      focus: focus(r.bodyText),
    }));

  return NextResponse.json({ saleLike });
}
