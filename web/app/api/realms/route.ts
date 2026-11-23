import { connection } from "next/server";
import { getLounge, getQuestboard, getTownhall } from "@/lib/gno";

export async function GET() {
  await connection();
  const [questboard, townhall, lounge] = await Promise.all([getQuestboard(), getTownhall(), getLounge()]);
  return Response.json({ questboard, townhall, lounge });
}
