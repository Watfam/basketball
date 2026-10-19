"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import { cameFrom } from "@/lib/use-go-back";
import { screenName } from "@/lib/nav-stack";
import { headerLinkClass } from "@/components/ui/header-link-class";

const subscribeNone = () => () => {};

/**
 * "Back" that goes to the screen the player came from and says its name (from the workout library: "Workouts", not always "Train").
 * With nowhere recorded (the app was opened on this screen) it is a plain link to `href` with `label`.
 */
export function BackLink({ href, label }: { href: string; label: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Read from this tab's record of screens; the server (and the first paint) knows nothing of it and shows the default.
  const from = useSyncExternalStore(subscribeNone, () => cameFrom(pathname), () => null);
  const name = from ? screenName(from) ?? "Back" : null;
  return (
    <Link
      href={from ?? href}
      onClick={(e) => {
        if (!from) return;
        e.preventDefault();
        router.back();
      }}
      className={headerLinkClass("dim")}
    >
      ← {name ?? label}
    </Link>
  );
}

