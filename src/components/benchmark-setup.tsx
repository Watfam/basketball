"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPlayerProfile } from "@/app/actions";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/field";

/**
 * Collects the age and gender the combine needs to pick a benchmark band.
 *
 * Shown only when one of them is missing, and framed for what it is:
 * these two fields choose which table a score is compared against, and a
 * 20 inch vertical genuinely means something different for a twelve year
 * old girl than for a seventeen year old boy. Scoring everyone against
 * one table would make the resulting rating close to meaningless for
 * anyone outside the middle.
 */
export function BenchmarkSetup({
  playerId,
  currentBirthYear,
  currentGender,
}: {
  playerId: string;
  currentBirthYear: number | null;
  currentGender: string | null;
}) {
  const router = useRouter();
  const [birthYear, setBirthYear] = useState(currentBirthYear ? String(currentBirthYear) : "");
  const [gender, setGender] = useState(currentGender ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    haptic("tap");
    setError(null);
    startTransition(async () => {
      const result = await setPlayerProfile(playerId, {
        gender: gender || null,
        birthYear: birthYear ? Number(birthYear) : null,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mb-4 rounded-2xl border border-accent/40 bg-accent/5 p-4">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-accent">
        Before you start
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-foreground-dim">
        These pick which benchmarks your scores are compared against. A 20&quot; vertical is a 10
        for a young player and average for a senior — without these you&rsquo;ll be scored against
        the middle.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">
            Birth year
          </p>
          <Input
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            inputMode="numeric"
            placeholder="2011"
          />
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">
            Benchmarks
          </p>
          <div className="flex gap-1.5">
            {[
              { value: "male", label: "Boys" },
              { value: "female", label: "Girls" },
            ].map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGender(g.value)}
                className={`flex-1 rounded-lg border px-2 py-2 text-[11px] font-extrabold uppercase tracking-wide transition-colors ${
                  gender === g.value
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-raised text-foreground-dim"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Button variant="secondary" block onClick={save} disabled={pending || (!birthYear && !gender)} className="mt-3">
        {pending ? "Saving…" : "Save and use these benchmarks"}
      </Button>

      {error && <FormError className="mt-2">{error}</FormError>}
    </div>
  );
}
