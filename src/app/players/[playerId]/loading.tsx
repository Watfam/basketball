import { Card } from "@/components/ui/card";

/** Today's shape: header, the week, the next-up card, two quick starts. */
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line px-5 py-2.5">
        <div className="mx-auto flex max-w-lg items-center gap-2.5">
          <div className="h-8 w-8 animate-pulse rounded-full bg-elevated" />
          <div className="h-4 w-32 animate-pulse rounded-full bg-elevated" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-5 sm:py-8">
        <Card className="h-24 animate-pulse" />
        <div className="h-56 animate-pulse rounded-3xl border border-line bg-elevated" />
        <div className="grid grid-cols-2 gap-3">
          <Card className="h-28 animate-pulse" />
          <Card className="h-28 animate-pulse" />
        </div>
      </main>
    </div>
  );
}
