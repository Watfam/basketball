"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

/**
 * Shown when a screen fails to load (usually no signal, or the database
 * didn't answer). Anything saved on the phone, like a shooting set in
 * progress, is still there.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-5 py-12">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent">Something went wrong</p>
        <h1 className="mt-2 font-display text-4xl uppercase leading-none text-foreground">That screen didn&rsquo;t load</h1>
        <p className="mt-3 text-sm leading-relaxed text-foreground-dim">
          It&rsquo;s usually the signal. Try again, or head back to the start. Anything you were in the middle of is
          still saved on this phone.
        </p>
      </div>
      <div className="flex flex-col gap-2.5">
        <Button size="lg" block onClick={reset}>
          Try again
        </Button>
        <ButtonLink href="/" variant="secondary" size="lg" block>
          Back to the start
        </ButtonLink>
      </div>
      {error.digest && <p className="text-[11px] text-foreground-mute">Error code {error.digest}</p>}
    </main>
  );
}
