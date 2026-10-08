import { ButtonLink } from "@/components/ui/button";

/** A link to something that isn't there (deleted, or another family's). */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-5 py-12">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent">Not here</p>
        <h1 className="mt-2 font-display text-4xl uppercase leading-none text-foreground">Nothing at this address</h1>
        <p className="mt-3 text-sm leading-relaxed text-foreground-dim">
          It may have been deleted, or the link is old.
        </p>
      </div>
      <ButtonLink href="/" size="lg" block>
        Back to the start
      </ButtonLink>
    </main>
  );
}
