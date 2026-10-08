import Link from "next/link";
import { Avatar } from "@/components/avatar";

/**
 * The top bar of the player's own tabs (Today, Me): who is using the
 * phone, and the one place to change it.
 */
export function PlayerTabHeader({ playerId, name }: { playerId: string; name: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-2.5 backdrop-blur">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar id={playerId} name={name} size={32} />
          <span className="truncate font-display text-xl uppercase leading-none tracking-wide text-foreground">
            {name}
          </span>
        </div>
        <Link
          href="/"
          aria-label={`Not ${name}? Switch profile`}
          className="-my-2.5 inline-flex shrink-0 items-center py-2.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
        >
          Switch
        </Link>
      </div>
    </header>
  );
}
