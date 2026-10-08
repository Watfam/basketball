import Link from "next/link";
import { SurvivalTest } from "@/components/survival-test";

export const metadata = { title: "Survival test" };

export default function SurvivalTestPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto w-full max-w-md">
          <Link
            href="/lab/diagnose"
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
          >
            ← Diagnostic tests
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-5 sm:py-8">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">Experimental</p>
          <h1 className="font-display mt-1 text-3xl uppercase leading-none tracking-wide text-foreground">
            Survival test
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-foreground-dim">
            The crash is random, so one run of anything proves nothing. This repeats each setup
            several times, interleaved, and counts how many survive. It restarts itself after
            every crash. Nothing is recorded or sent anywhere.
          </p>
        </div>
        <SurvivalTest />
      </main>
    </div>
  );
}
