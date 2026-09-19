export default function Loading() {
  return (
    <div className="flex flex-1 flex-col justify-center px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-1.5 flex-1 animate-pulse rounded-full bg-line" />
          ))}
        </div>

        <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
          <div className="h-3 w-32 animate-pulse rounded-full bg-elevated" />
          <div className="mt-3 h-6 w-3/4 animate-pulse rounded-full bg-elevated" />
          <div className="mt-8 grid grid-cols-2 gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-elevated" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
