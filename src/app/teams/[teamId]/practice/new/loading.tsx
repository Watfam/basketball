export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line px-5 py-3">
        <div className="mx-auto w-full max-w-md">
          <div className="h-3 w-28 animate-pulse rounded-full bg-elevated" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 space-y-5 px-4 py-5 sm:py-8">
        <div className="rounded-3xl border border-line bg-surface p-6">
          <div className="h-8 w-full animate-pulse rounded-lg bg-elevated" />
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="h-8 w-32 animate-pulse rounded-lg bg-elevated" />
            <div className="h-3 w-16 animate-pulse rounded-full bg-elevated" />
          </div>
        </div>

        <div className="rounded-3xl border border-line bg-surface p-6">
          <div className="h-3 w-16 animate-pulse rounded-full bg-elevated" />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 w-28 animate-pulse rounded-full border border-line bg-[var(--raised)]" />
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-line bg-surface p-6 space-y-3">
          <div className="h-3 w-20 animate-pulse rounded-full bg-elevated" />
          <div className="grid grid-cols-2 gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl border border-line bg-[var(--raised)]" />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`flex items-center gap-2 px-2 py-3 ${i > 0 ? "border-t border-line" : ""}`}
            >
              <div className="h-3.5 flex-1 animate-pulse rounded-full bg-elevated" />
              <div className="h-3 w-8 animate-pulse rounded-full bg-elevated" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
