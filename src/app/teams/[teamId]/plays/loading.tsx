/**
 * The ancestor fallback for every route under /plays — playbook, philosophy, the export picker, and
 * the designer all nest under this segment, so whatever shows here can flash briefly for any of them
 * on a cold navigation, before each route's own more specific loading.tsx takes over. Stays neutral
 * and light for exactly that reason: a forced-dark full-bleed rectangle (which this used to be, sized
 * for the designer alone) flashed under the OTHER three routes too, since none of them had their own
 * loading.tsx yet. Each of those four routes now has one; this one only needs to not be jarring.
 *
 * A single pulsing header bar, not a full skeleton — every child route has its own sticky header in
 * roughly this shape, so this reads as "the page is loading" for whichever one is actually coming,
 * rather than guessing at content that's wrong for three of the four.
 */
export default function Loading() {
  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      <div className="border-b border-line px-5 py-3">
        <div className="mx-auto w-full max-w-lg">
          <div className="h-3 w-20 animate-pulse rounded-full bg-elevated" />
        </div>
      </div>
    </div>
  );
}
