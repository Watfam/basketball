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
          <div className="h-3 w-16 animate-pulse rounded-full bg-elevated" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-5 sm:py-8">
        <div className="space-y-1.5">
          <div className="h-5 w-40 animate-pulse rounded-full bg-elevated" />
          <div className="h-3 w-56 animate-pulse rounded-full bg-elevated" />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2 rounded-xl border border-line bg-raised p-4">
            <div className="h-3 w-32 animate-pulse rounded-full bg-elevated" />
            <div className="h-3 w-full animate-pulse rounded-full bg-elevated" />
            <div className="h-3 w-5/6 animate-pulse rounded-full bg-elevated" />
          </div>
        ))}
      </main>
    </div>
  );
}
