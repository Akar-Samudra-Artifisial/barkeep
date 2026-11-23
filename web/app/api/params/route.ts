import { connection } from "next/server";
import { json } from "@/lib/api";
import { getParams } from "@/lib/gno";

export async function GET() {
  await connection();
  return json(await getParams());
}
