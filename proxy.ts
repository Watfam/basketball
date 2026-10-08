import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico
     * - /ort and /models: static runtime and model files. They are public
     *   downloads, and running a session check before each (one is 25 MB)
     *   only slows the first camera load.
     * - the PWA manifest and app icon: browsers fetch these without
     *   cookies, so the session check bounced them to /login and the
     *   manifest came back as HTML
     * - public assets (svg, png, jpg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|app-icon|ort/|models/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
