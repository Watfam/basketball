export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line px-5 py-3">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between">
          <div className="h-3 w-20 animate-pulse rounded-full bg-elevated" />
          <div className="h-3 w-20 animate-pulse rounded-full bg-elevated" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-3 px-4 py-5 sm:py-8">
        <div className="h-8 w-40 animate-pulse rounded-full bg-elevated" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface p-4">
            <div className="h-5 w-32 animate-pulse rounded-full bg-elevated" />
            <div className="mt-2 h-3 w-full animate-pulse rounded-full bg-elevated" />
          </div>
        ))}
      </main>
    </div>
  );
}
