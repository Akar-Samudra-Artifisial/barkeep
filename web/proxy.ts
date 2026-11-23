import { NextResponse, type NextRequest } from "next/server";

// Next decodes dynamic params before route code runs, so a malformed
// percent-encoding (e.g. /profile/%E0%A4%A) would surface as a bare 500.
// Catch it here: the API answers 400 JSON, the page shows its
// "not a gno.land address" message.
export function proxy(request: NextRequest) {
  const raw = request.nextUrl.pathname;
  try {
    decodeURIComponent(raw);
    return NextResponse.next();
  } catch {
    if (raw.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, kind: "parse", message: "Address is not valid URL encoding", fetchedAt: Date.now() },
        { status: 400 },
      );
    }
    // A rewrite keeps the original params (and the decode error); redirect instead.
    return NextResponse.redirect(new URL("/profile/invalid-address", request.url));
  }
}

export const config = {
  matcher: ["/api/profile/:path*", "/profile/:path*"],
};
