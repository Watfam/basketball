import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { GpuDiagnostic } from "@/components/gpu-diagnostic";

export const metadata = { title: "GPU diagnostic" };

export default function GpuDiagnosticPage() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: "/lab/detector", label: "Detector lab" }} width="md" />

      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-5 sm:py-8">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">Experimental</p>
          <h1 className="font-display mt-1 text-3xl uppercase leading-none tracking-wide text-foreground">
            GPU diagnostic
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-foreground-dim">
            A fixed sequence of tests, each one isolating one part of the camera-and-model
            pipeline, to find exactly what makes the browser close the page. Nothing is recorded
            or sent anywhere.
          </p>
        </div>
        <GpuDiagnostic />
        <Link
          href="/lab/survival"
          className="block rounded-xl border border-accent bg-surface px-4 py-3 text-center text-[11px] font-extrabold uppercase tracking-wide text-accent"
        >
          Go to the survival test (repeated trials)
        </Link>
      </main>
    </div>
  );
}
