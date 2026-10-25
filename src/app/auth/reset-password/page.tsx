"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/field";
import { BrandLockup } from "@/components/brand";

/**
 * Landing point after the "forgot password" email link: `/auth/callback`
 * has already exchanged the one-time code for a real session, so this page
 * just needs the new password.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setReady(!!data.user));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setError(null);
    setLoading(true);
    const { error } = await createClient().auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  return (
    <div className="court-glow flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-8">
        <BrandLockup size={44} />
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-foreground">Set a new password</h1>

        {ready === null ? null : !ready ? (
          <>
            <p className="mt-1 text-sm text-foreground-dim">
              This reset link is invalid or has expired.
            </p>
            <Button className="mt-6" size="lg" block onClick={() => router.push("/login")}>
              Back to sign in
            </Button>
          </>
        ) : done ? (
          <>
            <p className="mt-1 text-sm text-foreground-dim">Your password has been updated.</p>
            <Button className="mt-6" size="lg" block onClick={() => router.push("/")}>
              Continue
            </Button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wide text-foreground-dim">
                New password
              </label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <label htmlFor="confirm" className="block text-xs font-semibold uppercase tracking-wide text-foreground-dim">
                Confirm password
              </label>
              <Input
                id="confirm"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-2"
              />
            </div>

            {error && <FormError>{error}</FormError>}

            <Button type="submit" disabled={loading} size="lg" block>
              {loading ? "Please wait…" : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
