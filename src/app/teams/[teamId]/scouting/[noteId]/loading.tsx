export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line px-5 py-3">
        <div className="mx-auto w-full max-w-md">
          <div className="h-3 w-20 animate-pulse rounded-full bg-elevated" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-5 sm:py-8">
        <div className="h-9 animate-pulse rounded-lg border border-line bg-surface" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-24 animate-pulse rounded-full bg-elevated" />
            <div className="h-20 animate-pulse rounded-lg border border-line bg-surface" />
          </div>
        ))}
        <div className="h-12 animate-pulse rounded-xl bg-elevated" />
      </main>
    </div>
  );
}
