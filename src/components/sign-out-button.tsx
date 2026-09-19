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
      className="text-sm font-medium text-zinc-500 hover:text-zinc-900 disabled:opacity-50 dark:hover:text-zinc-100"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
