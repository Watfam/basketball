export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <div className="space-y-2">
          <div className="h-3 w-28 animate-pulse rounded-full bg-elevated" />
          <div className="h-3 w-20 animate-pulse rounded-full bg-elevated" />
        </div>
        <div className="h-3 w-16 animate-pulse rounded-full bg-elevated" />
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8 sm:py-12">
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="h-5 w-24 animate-pulse rounded-full bg-elevated" />
            <div className="h-3 w-64 animate-pulse rounded-full bg-elevated" />
          </div>

          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3.5"
              >
                <div className="space-y-2">
                  <div className="h-3.5 w-28 animate-pulse rounded-full bg-elevated" />
                  <div className="h-3 w-40 animate-pulse rounded-full bg-elevated" />
                </div>
                <div className="h-6 w-14 animate-pulse rounded-lg bg-elevated" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
