export default function Loading() {
  return (
    <div className="theme-dark flex min-h-[100dvh] flex-col bg-background px-5 py-6 text-foreground">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex items-center justify-between gap-3">
          <div className="h-3 w-24 animate-pulse rounded-full bg-raised" />
          <div className="h-3 w-16 animate-pulse rounded-full bg-raised" />
        </div>
        <div className="mt-3 h-1 animate-pulse rounded-full bg-raised" />

        <div className="mt-10 h-3 w-32 animate-pulse rounded-full bg-raised" />
        <div className="mt-3 h-10 w-3/4 animate-pulse rounded-lg bg-raised" />
        <div className="mt-3 h-3 w-40 animate-pulse rounded-full bg-raised" />

        <div className="mx-auto mt-10 h-16 w-40 animate-pulse rounded-lg bg-raised" />

        <div className="mt-auto flex gap-2.5 pt-8">
          <div className="h-14 flex-1 animate-pulse rounded-xl bg-raised" />
          <div className="h-14 flex-1 animate-pulse rounded-xl bg-raised" />
        </div>
      </div>
    </div>
  );
}
