import { Card } from "@/components/ui/card";

/** Today's shape while it loads: header, welcome, the one thing to do, the three numbers, a focus, recent work. */
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col" aria-busy="true" aria-label="Loading Today">
      <header className="border-b border-line px-5 py-2.5">
        <div className="mx-auto flex max-w-lg items-center gap-2.5">
          <div className="h-8 w-8 animate-pulse rounded-full bg-elevated" />
          <div className="h-4 w-32 animate-pulse rounded-full bg-elevated" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-5 px-4 py-5 sm:py-8">
        <div className="space-y-2">
          <div className="h-9 w-3/4 animate-pulse rounded-lg bg-elevated" />
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-elevated" />
          <div className="flex gap-1.5 pt-1">{Array.from({ length: 7 }, (_, i) => <div key={i} className="h-8 w-8 animate-pulse rounded-full bg-elevated" />)}</div>
        </div>
        <div className="h-52 animate-pulse rounded-3xl border border-line bg-elevated" />
        <Card className="h-56 animate-pulse" />
        <Card className="h-32 animate-pulse" />
        <Card className="h-40 animate-pulse" />
      </main>
    </div>
  );
}
