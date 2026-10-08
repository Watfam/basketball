"use client";

import { useTransition } from "react";
import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="ghost" size="sm" onClick={() => startTransition(() => signOut())} disabled={pending} className="-mr-3">
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
