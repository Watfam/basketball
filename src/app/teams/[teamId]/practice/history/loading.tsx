export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line px-5 py-3">
        <div className="mx-auto w-full max-w-lg">
          <div className="h-3 w-24 animate-pulse rounded-full bg-elevated" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-5 px-4 py-5 sm:py-8">
        <div className="h-8 w-40 animate-pulse rounded-full bg-elevated" />

        <div className="flex flex-wrap gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 w-28 animate-pulse rounded-full border border-line bg-surface" />
          ))}
        </div>

        <div className="flex gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex-1 rounded-2xl border border-line bg-surface p-4">
              <div className="h-3 w-14 animate-pulse rounded-full bg-elevated" />
              <div className="mt-2 h-7 w-16 animate-pulse rounded-full bg-elevated" />
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-line bg-surface p-5">
          <div className="h-3 w-48 animate-pulse rounded-full bg-elevated" />
          <div className="mt-4 h-40 animate-pulse rounded-lg bg-elevated" />
        </div>
      </main>
    </div>
  );
}
