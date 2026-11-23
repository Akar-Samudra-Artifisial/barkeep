import { json } from "@/lib/api";
import { getProfile, safeDecode } from "@/lib/gno";

export async function GET(_req: Request, ctx: RouteContext<"/api/profile/[addr]">) {
  const { addr } = await ctx.params;
  const decoded = safeDecode(addr);
  if (decoded === null) {
    return Response.json(
      { ok: false, kind: "parse", message: "Address is not valid URL encoding", fetchedAt: Date.now() },
      { status: 400 },
    );
  }
  return json(await getProfile(decoded.toLowerCase()));
}
