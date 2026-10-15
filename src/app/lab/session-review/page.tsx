import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { SessionReviewLab } from "@/components/session-review-lab";

export const metadata = { title: "Session review (beta)" };

/** Turn the experimental session review and tracking history on or off, and run the on-phone storage test. Coach-only, like the camera lab. */
export default async function SessionReviewLabPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <div className="mx-auto w-full max-w-md px-4 pb-10 pt-4">
      <PageHeader back={{ href: "/lab", label: "Camera lab" }} width="md" />
      <h1 className="mt-3 font-display text-3xl">Session review (beta)</h1>
      <p className="mb-3 mt-1 text-xs text-foreground-dim">Experimental. Off by default. Everything stays on this phone.</p>
      <SessionReviewLab />
    </div>
  );
}
