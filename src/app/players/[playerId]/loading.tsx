export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line px-6 py-4">
        <div className="h-3 w-12 animate-pulse rounded-full bg-elevated" />
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-8 px-4 py-8 sm:py-12">
        <div className="h-64 animate-pulse rounded-3xl border-2 border-line bg-elevated" />
        <div className="h-16 animate-pulse rounded-2xl border border-line bg-surface" />
        <div>
          <div className="h-3 w-20 animate-pulse rounded-full bg-elevated" />
          <div className="mt-3 h-40 animate-pulse rounded-2xl border border-line bg-surface" />
        </div>
        <div>
          <div className="h-3 w-32 animate-pulse rounded-full bg-elevated" />
          <div className="mt-3 h-14 animate-pulse rounded-xl border border-line bg-surface" />
        </div>
      </main>
    </div>
  );
}
