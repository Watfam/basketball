import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line px-5 py-3">
        <div className="mx-auto w-full max-w-lg">
          <div className="h-3 w-24 animate-pulse rounded-full bg-elevated" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 space-y-5 px-4 py-5 sm:py-8">
        <div className="h-52 animate-pulse rounded-3xl border border-line bg-surface" />
        <div className="flex gap-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="h-20 flex-1 animate-pulse" />
          ))}
        </div>
        <Card className="h-44 animate-pulse" />
      </main>
    </div>
  );
}
