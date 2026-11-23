import { connection } from "next/server";
import { json } from "@/lib/api";
import { getSources } from "@/lib/gno";

export async function GET() {
  await connection();
  return json(await getSources());
}
