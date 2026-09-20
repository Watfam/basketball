export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <div className="space-y-2">
          <div className="h-3 w-12 animate-pulse rounded-full bg-elevated" />
          <div className="h-3 w-32 animate-pulse rounded-full bg-elevated" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-3 px-4 py-8 sm:py-12">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface p-5">
            <div className="h-4 w-40 animate-pulse rounded-full bg-elevated" />
            <div className="mt-2 h-3 w-full animate-pulse rounded-full bg-elevated" />
            <div className="mt-4 space-y-2 border-t border-line pt-4">
              <div className="h-3 w-3/4 animate-pulse rounded-full bg-elevated" />
              <div className="h-3 w-2/3 animate-pulse rounded-full bg-elevated" />
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
