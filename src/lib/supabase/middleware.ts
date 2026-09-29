import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request. Wired up in
 * middleware.ts at the project root. This keeps server components from
 * seeing a stale/expired session.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing logic between createServerClient and
  // getClaims(). A simple mistake could make it very hard to debug
  // sessions randomly logging users out.
  //
  // getClaims() rather than getUser(): this runs before every single
  // navigation, and getUser() always makes a network round trip to the
  // Auth server. getClaims() verifies the JWT signature locally when the
  // project uses asymmetric signing keys (falling back to the same server
  // check as getUser() when it doesn't, so it is never slower). It still
  // refreshes an expiring session. The tradeoff is that a revoked session
  // stays valid until its access token expires (an hour by default),
  // which is fine here - pages still enforce ownership through RLS.
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims ?? null;

  // Redirect unauthenticated users away from protected routes. Only the
  // login page and the auth callback (email confirmation / magic link
  // landing) are public — everything else, including "/", requires a
  // session, since "/" is the household/player dashboard.
  const { pathname } = request.nextUrl;
  const isPublicRoute =
    pathname.startsWith("/login") || pathname.startsWith("/auth");

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Signed-in users shouldn't land back on the login screen.
  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
