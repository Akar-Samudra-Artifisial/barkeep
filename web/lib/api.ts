import { REVALIDATE_SECONDS, dataSource } from "./config";
import type { Read } from "./types";

/** Serialise a Read<T>; chain-side failures map to honest status codes. Live reads are never cached by a CDN. */
export function json<T>(r: Read<T>): Response {
  const status = r.ok ? 200 : r.kind === "not-deployed" ? 404 : r.kind === "parse" ? 502 : 503;
  const cacheControl =
    dataSource() === "fixture"
      ? `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS}`
      : "no-store";
  return Response.json(r, { status, headers: { "cache-control": cacheControl } });
}
