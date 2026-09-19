import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateHouseholdForm } from "@/components/create-household-form";
import { AddPlayerForm } from "@/components/add-player-form";
import { SignOutButton } from "@/components/sign-out-button";
import { PRIMARY_POSITIONS } from "@/lib/basketball/taxonomy";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // A user owns at most one household in this model (see supabase/schema.sql).
  const { data: household } = await supabase
    .schema("hoops")
    .from("households")
    .select("id, name")
    .eq("owner_id", user.id)
    .maybeSingle();

  const { data: players } = household
    ? await supabase
        .schema("hoops")
        .from("players")
        .select("id, display_name, birth_year, primary_position")
        .eq("household_id", household.id)
        .order("created_at", { ascending: true })
    : { data: null };

  const positionLabel = (value: string | null) =>
    PRIMARY_POSITIONS.find((p) => p.value === value)?.label ?? null;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <p className="text-sm font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            HARDWOOD LAB
          </p>
          {household && (
            <p className="text-xs text-zinc-500">{household.name}</p>
          )}
        </div>
        <SignOutButton />
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
        {!household ? (
          <CreateHouseholdForm />
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                Players
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Add each player in your household to build their profile and start their offseason plan.
              </p>
            </div>

            <div className="space-y-3">
              {players?.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div>
                    <p className="font-medium text-zinc-950 dark:text-zinc-50">
                      {player.display_name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {[positionLabel(player.primary_position), player.birth_year]
                        .filter(Boolean)
                        .join(" · ") || "Assessment not started"}
                    </p>
                  </div>
                  {/* Onboarding assessment link lands here once that flow is built. */}
                </div>
              ))}

              <AddPlayerForm householdId={household.id} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
