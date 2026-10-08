import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { TeamForm } from "@/components/team-form";

export default async function NewTeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: "/", label: "Home" }} width="md" />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-5 sm:py-8">
        <div className="mb-5">
          <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">
            New Team
          </h1>
          <p className="mt-1.5 text-xs text-foreground-dim">
            Set the scheme and focus once — every practice plan and roster note lives under it.
          </p>
        </div>
        <TeamForm />
      </main>
    </div>
  );
}
