"use client";

import { useTransition } from "react";
import { signOut } from "@/app/actions";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => signOut())}
      disabled={pending}
      className="text-sm font-medium text-foreground-dim hover:text-foreground disabled:opacity-50"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
