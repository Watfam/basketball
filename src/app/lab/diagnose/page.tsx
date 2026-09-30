import Link from "next/link";
import { GpuDiagnostic } from "@/components/gpu-diagnostic";

export const metadata = { title: "GPU diagnostic" };

export default function GpuDiagnosticPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto w-full max-w-md">
          <Link
            href="/lab/detector"
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
          >
            ← Detector lab
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-5 sm:py-8">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent">Experimental</p>
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
      </main>
    </div>
  );
}
