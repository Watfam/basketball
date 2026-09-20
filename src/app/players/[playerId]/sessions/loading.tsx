export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line px-6 py-4">
        <div className="h-3 w-12 animate-pulse rounded-full bg-elevated" />
        <div className="mt-2 h-3 w-32 animate-pulse rounded-full bg-elevated" />
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-2 px-4 py-8 sm:py-12">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
            <div className="space-y-2">
              <div className="h-3.5 w-32 animate-pulse rounded-full bg-elevated" />
              <div className="h-3 w-24 animate-pulse rounded-full bg-elevated" />
            </div>
            <div className="h-6 w-14 animate-pulse rounded-full bg-elevated" />
          </div>
        ))}
      </main>
    </div>
  );
}
