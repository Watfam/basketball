import { Card } from "@/components/ui/card";

/**
 * Without this, a cold navigation can transiently show the parent /plays
 * segment's own loading.tsx instead, while this route's code is still
 * loading. That ancestor fallback is intentionally generic (it covers this
 * route, Philosophy, Share, and the designer); this one matches the actual
 * shape of the playbook list so the swap isn't jarring.
 */
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between">
          <div className="h-3 w-20 animate-pulse rounded-full bg-elevated" />
          <div className="flex gap-2">
            <div className="h-9 w-24 animate-pulse rounded-xl border border-line-strong bg-surface" />
            <div className="h-9 w-20 animate-pulse rounded-xl bg-elevated" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-5 sm:py-8">
        <div className="h-8 w-40 animate-pulse rounded-full bg-elevated" />
        <div className="h-11 animate-pulse rounded-xl bg-elevated" />
        <div className="h-10 animate-pulse rounded-xl bg-elevated" />
        <div className="flex gap-1.5">
          {[24, 20, 24, 28, 20, 20].map((w, i) => (
            <div key={i} className="h-8 shrink-0 animate-pulse rounded-full bg-raised" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-7 w-16 animate-pulse rounded-full border border-line bg-surface" />
          ))}
        </div>

        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="overflow-hidden p-0">
              <div className="h-28 w-full animate-pulse bg-elevated" />
              <div className="space-y-2 p-4">
                <div className="h-4 w-2/3 animate-pulse rounded-full bg-elevated" />
                <div className="h-3 w-1/3 animate-pulse rounded-full bg-elevated" />
              </div>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
