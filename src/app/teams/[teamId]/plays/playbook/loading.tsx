import { Card } from "@/components/ui/card";

/**
 * Without this, Next.js falls back to the parent /plays segment's own
 * loading.tsx — an empty, forced-dark full-screen rectangle built for the
 * (full-bleed, dark) play designer. The playbook list is an ordinary light
 * page, so it needs its own fallback instead of inheriting that one.
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
        <div className="h-8 w-40 animate-pulse rounded-full bg-elevated" />
        <div className="h-11 animate-pulse rounded-xl bg-elevated" />
        <div className="h-10 animate-pulse rounded-xl bg-elevated" />
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-raised p-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-7 animate-pulse rounded-lg bg-elevated" />
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
