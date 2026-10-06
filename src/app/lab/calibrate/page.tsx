import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CalibrationForm } from "@/components/calibration-form";

export const metadata = { title: "Calibrate the camera" };

export default async function CalibratePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto w-full max-w-md">
          <Link
            href="/lab"
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
          >
            ← Camera lab
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-5 sm:py-8">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent">Coach</p>
          <h1 className="font-display mt-1 text-3xl uppercase leading-none tracking-wide text-foreground">Calibrate</h1>
          <p className="mt-2 text-xs leading-relaxed text-foreground-dim">
            Set the camera&rsquo;s calls from the last lab run against what really happened. Enter every shot in
            order, the way you wrote them down.
          </p>
        </div>
        <CalibrationForm />
      </main>
    </div>
  );
}
