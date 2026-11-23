import type { NextRequest } from "next/server";
import { json } from "@/lib/api";
import { clampPage, getLeaderboard } from "@/lib/gno";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { offset, limit } = clampPage(sp.get("offset") ?? 0, sp.get("limit") ?? 50);
  return json(await getLeaderboard(offset, limit));
}
