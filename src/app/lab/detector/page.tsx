import Link from "next/link";
import { DetectorLab } from "@/components/detector-lab";

export const metadata = { title: "Detector lab" };

export default function DetectorLabPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto w-full max-w-md">
          <Link
            href="/"
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
          >
            ← Home
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-5 sm:py-8">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent">Experimental</p>
          <h1 className="font-display mt-1 text-3xl uppercase leading-none tracking-wide text-foreground">
            Detector lab
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-foreground-dim">
            Runs a ball-finding model on this phone&rsquo;s camera and measures how fast it goes and
            whether it slows as the phone warms up. Everything happens on the device; nothing is
            recorded or sent anywhere. This is a generic model, so it will miss balls a trained
            one would catch — the speed is what this test is for.
          </p>
        </div>
        <DetectorLab />
      </main>
    </div>
  );
}
