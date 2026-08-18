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
  const needles = ["$", "total", "paid", "price", "earn", "sold", "sale", "order", "ship", "mercari"];
  const parts: string[] = [];
  for (const needle of needles) {
    const lower = clean.toLowerCase();
    let at = lower.indexOf(needle);
    let hits = 0;
    while (at >= 0 && hits < 2) {
      const start = Math.max(0, at - 140);
      const end = Math.min(clean.length, at + 320);
      parts.push(clean.slice(start, end));
      hits++;
      at = lower.indexOf(needle, at + needle.length);
    }
  }
  return [...new Set(parts)].slice(0, 8);
}

function view(r: any) {
  return {
    sender: r.sender,
    subject: r.subject,
    marketplace: r.marketplace,
    parsed: r.parsed,
    receivedAt: r.receivedAt,
    focus: focus(r.bodyText),
  };
}

export async function GET() {
  const rows = await prisma.emailMessage.findMany({
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    take: 500,
    select: { sender: true, subject: true, marketplace: true, parsed: true, receivedAt: true, bodyText: true },
  });

  const saleLike = rows
    .filter((r) => /you made the sale|sale confirmation|sold|it's time to ship/i.test(r.subject ?? ""))
    .slice(0, 20)
    .map(view);

  const mercari = rows
    .filter((r) => r.marketplace === "MERCARI" || /mercari/i.test(`${r.sender ?? ""} ${r.subject ?? ""}`))
    .slice(0, 20)
    .map(view);

  return NextResponse.json({ saleLike, mercari });
}
