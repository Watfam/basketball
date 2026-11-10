/**
 * Without this, Next.js falls back to the parent /plays segment's own
 * loading.tsx — an empty, forced-dark full-screen rectangle built for the
 * (full-bleed, dark) play designer. This is an ordinary light page, so it
 * needs its own fallback instead of inheriting that one.
 */
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between">
          <div className="h-3 w-16 animate-pulse rounded-full bg-elevated" />
          <div className="h-3 w-24 animate-pulse rounded-full bg-elevated" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-5 sm:py-8">
        <div className="space-y-1.5">
          <div className="h-3 w-full animate-pulse rounded-full bg-elevated" />
          <div className="h-3 w-5/6 animate-pulse rounded-full bg-elevated" />
        </div>
        <div className="h-11 animate-pulse rounded-xl border border-line bg-surface" />
        <div className="flex gap-2">
          <div className="h-8 w-24 animate-pulse rounded-lg bg-elevated" />
          <div className="h-8 w-20 animate-pulse rounded-lg bg-elevated" />
        </div>
        <div className="space-y-1.5 rounded-xl border border-line bg-surface p-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-elevated" />
          ))}
        </div>
      </main>
    </div>
  );
}
