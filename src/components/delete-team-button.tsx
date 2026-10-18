"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTeam } from "@/app/actions";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";

/**
 * Deleting a team takes its roster, practice plans, practices, games and
 * scouting notes with it. The family's players and their own training are
 * untouched (they belong to the household, not the team).
 */
export function DeleteTeamButton({ teamId, teamName }: { teamId: string; teamName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    const typed = window.prompt(
      `This deletes ${teamName}: its roster, practice plans, practices, games and scouting notes. Your family's players and their training stay.\n\nType the team's name to delete it.`
    );
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== teamName.trim().toLowerCase()) {
      setError("The name didn't match, so nothing was deleted.");
      return;
    }
    haptic("tap");
    setError(null);
    startTransition(async () => {
      const result = await deleteTeam(teamId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.push("/coach");
    });
  }

  return (
    <div className="mt-10 border-t border-line pt-5">
      <Button variant="danger" size="md" block onClick={remove} disabled={pending}>
        {pending ? "Deleting…" : "Delete this team"}
      </Button>
      {error && <FormError className="mt-2 text-center">{error}</FormError>}
    </div>
  );
}
