/**
 * Without this, Next.js falls back to the parent /plays segment's own
 * loading.tsx — an empty, forced-dark full-screen rectangle built for the
 * (full-bleed, dark) play designer. A single play's view is an ordinary
 * light page, so it needs its own fallback instead of inheriting that one.
 */
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-5 sm:py-8">
        <div className="flex items-center justify-between">
          <div className="h-3 w-20 animate-pulse rounded-full bg-elevated" />
          <div className="h-3 w-12 animate-pulse rounded-full bg-elevated" />
        </div>
        <div className="h-6 w-1/2 animate-pulse rounded-full bg-elevated" />
        <div className="h-3 w-1/3 animate-pulse rounded-full bg-elevated" />
        <div className="aspect-square w-full animate-pulse rounded-2xl border border-line bg-elevated sm:aspect-video" />
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-3.5 w-full animate-pulse rounded-full bg-elevated" />
          ))}
        </div>
      </main>
    </div>
  );
}
