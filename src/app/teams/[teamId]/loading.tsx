export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line px-5 py-3">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between">
          <div className="h-3 w-16 animate-pulse rounded-full bg-elevated" />
          <div className="h-3 w-10 animate-pulse rounded-full bg-elevated" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-5 px-4 py-5 sm:py-8">
        <div className="h-40 animate-pulse rounded-3xl border border-line bg-elevated" />
        <div className="grid grid-cols-2 gap-2.5">
          <div className="h-20 animate-pulse rounded-2xl border border-line bg-surface" />
          <div className="h-20 animate-pulse rounded-2xl border border-line bg-surface" />
        </div>
        <div>
          <div className="mb-2.5 h-5 w-20 animate-pulse rounded-full bg-elevated" />
          <div className="divide-y divide-line rounded-2xl border border-line bg-surface px-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <div className="h-3.5 flex-1 animate-pulse rounded-full bg-elevated" />
                <div className="h-3 w-10 animate-pulse rounded-full bg-elevated" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
