import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for Supabase's email confirmation / magic link redirect.
 * Exchanges the one-time `code` in the URL for a real session, then sends
 * the person into the app.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong (expired/invalid link) — send back to login with
  // an error flag the login page can surface.
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
