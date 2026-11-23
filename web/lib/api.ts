import { REVALIDATE_SECONDS } from "./config";
import type { Read } from "./types";

/** Serialise a Read<T>; chain-side failures map to honest status codes. */
export function json<T>(r: Read<T>): Response {
  const status = r.ok ? 200 : r.kind === "not-deployed" ? 404 : r.kind === "parse" ? 502 : 503;
  return Response.json(r, {
    status,
    headers: { "cache-control": `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS}` },
  });
}
