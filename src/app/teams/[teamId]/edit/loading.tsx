export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line px-5 py-3">
        <div className="mx-auto w-full max-w-md">
          <div className="h-3 w-20 animate-pulse rounded-full bg-elevated" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 space-y-5 px-4 py-5 sm:py-8">
        <div className="h-6 w-28 animate-pulse rounded-full bg-elevated" />
        <div className="h-14 animate-pulse rounded-2xl border border-line bg-surface" />
        <div className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded-full bg-elevated" />
          <div className="flex flex-wrap gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-8 w-24 animate-pulse rounded-full border border-line bg-surface" />
            ))}
          </div>
        </div>
        <div className="h-12 animate-pulse rounded-xl bg-elevated" />
      </main>
    </div>
  );
}
