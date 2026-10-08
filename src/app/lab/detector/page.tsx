import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DetectorLab } from "@/components/detector-lab";

export const metadata = { title: "Detector lab" };

export default function DetectorLabPage() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: "/lab", label: "Camera lab" }} width="md" />

      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-5 sm:py-8">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">Experimental</p>
          <h1 className="font-display mt-1 text-3xl uppercase leading-none tracking-wide text-foreground">
            Detector lab
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-foreground-dim">
            Runs a ball-finding model on this phone&rsquo;s camera and measures how fast it goes and
            whether it slows as the phone warms up. Everything happens on the device; nothing is
            recorded or sent anywhere. The stock model is a generic one, kept for comparing speed
            with earlier runs. Our ball model is the one trained on the driveway hoop: it reads a
            1080p window around the rim and counts makes with the same rule as the offline tests.
          </p>
        </div>
        <DetectorLab />
        <Link
          href="/lab/diagnose"
          className="block rounded-xl border border-line bg-surface px-4 py-3 text-center text-[11px] font-extrabold uppercase tracking-wide text-foreground-dim"
        >
          Run the GPU diagnostic tests
        </Link>
        <Link
          href="/lab/survival"
          className="block rounded-xl border border-accent bg-surface px-4 py-3 text-center text-[11px] font-extrabold uppercase tracking-wide text-accent"
        >
          Survival test (repeated trials)
        </Link>
      </main>
    </div>
  );
}
