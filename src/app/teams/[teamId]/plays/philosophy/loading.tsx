/**
 * Without this, a cold navigation can transiently show the parent /plays
 * segment's own loading.tsx instead, while this route's code is still
 * loading. That ancestor fallback is intentionally generic (it covers this
 * route, Playbook, Share, and the designer); this one matches the actual
 * shape of this page so the swap isn't jarring.
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
