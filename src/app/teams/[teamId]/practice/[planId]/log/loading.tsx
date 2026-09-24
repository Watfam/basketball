export default function Loading() {
  return (
    <div className="min-h-[100dvh] px-4 py-5 sm:py-8">
      <div className="mx-auto w-full max-w-md space-y-5">
        <div className="h-3 w-32 animate-pulse rounded-full bg-elevated" />

        <div className="rounded-3xl border border-line bg-surface p-6">
          <div className="flex items-baseline justify-between gap-3">
            <div className="h-6 w-40 animate-pulse rounded-full bg-elevated" />
            <div className="h-7 w-28 animate-pulse rounded-lg bg-elevated" />
          </div>
          <div className="mt-4 space-y-2.5 divide-y divide-line">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-2.5 py-2.5">
                <div className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-elevated" />
                <div className="h-3.5 flex-1 animate-pulse rounded-full bg-elevated" />
                <div className="h-7 w-14 shrink-0 animate-pulse rounded-lg bg-elevated" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-line bg-surface p-6">
          <div className="h-3 w-32 animate-pulse rounded-full bg-elevated" />
          <div className="mt-2 h-24 animate-pulse rounded-lg bg-elevated" />
        </div>

        <div className="h-12 animate-pulse rounded-xl bg-elevated" />
      </div>
    </div>
  );
}
