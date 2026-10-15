import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { CameraReferenceLab } from "@/components/camera-reference-lab";

export const metadata = { title: "Camera reference (beta)" };

/** Optional, experimental: keep a few numbers about how the camera sees the hoop and check later whether it moved. Coach-only, like the camera lab. */
export default async function CameraReferencePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <div className="mx-auto w-full max-w-md px-4 pb-10 pt-4">
      <PageHeader back={{ href: "/lab", label: "Camera lab" }} width="md" />
      <h1 className="mt-3 font-display text-3xl">Camera reference (beta)</h1>
      <p className="mb-3 mt-1 text-xs text-foreground-dim">Experimental and optional. Advisory only: it never changes counting. Everything stays on this phone.</p>
      <CameraReferenceLab />
    </div>
  );
}
