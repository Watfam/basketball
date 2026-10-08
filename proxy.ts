import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next 16 calls this "proxy" (it was "middleware"): it runs before every
// matched request and refreshes the Supabase session cookie.
export async function proxy(request: NextRequest) {
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
     * - sw.js: the service worker that keeps the camera model on the phone
     * - public assets (svg, png, jpg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|app-icon|sw.js|ort/|models/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
