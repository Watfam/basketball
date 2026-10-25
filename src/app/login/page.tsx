"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/field";
import { BrandLockup } from "@/components/brand";
type Mode = "sign_in" | "sign_up" | "forgot_password";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialError = searchParams.get("error");

  const [mode, setMode] = useState<Mode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? "That link expired or was already used. Please sign in again." : null
  );
  const [checkEmail, setCheckEmail] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    if (mode === "sign_in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/");
      router.refresh();
    } else if (mode === "sign_up") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      setCheckEmail(true);
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
      });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      setResetSent(true);
    }
  }

  return (
    <div className="court-glow flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-8">
        <BrandLockup size={44} />
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-foreground">
          {mode === "sign_in" ? "Welcome back" : mode === "sign_up" ? "Start your team" : "Reset your password"}
        </h1>
        <p className="mt-1 text-sm text-foreground-dim">
          {mode === "sign_in"
            ? "Sign in to your household account."
            : mode === "sign_up"
              ? "Create your household account."
              : "Enter your email and we'll send you a link to set a new password."}
        </p>

        {checkEmail ? (
          <div className="mt-6 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm text-foreground">
            Check <strong>{email}</strong> for a confirmation link to finish creating your account.
          </div>
        ) : resetSent ? (
          <div className="mt-6 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm text-foreground">
            Check <strong>{email}</strong> for a link to reset your password.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wide text-foreground-dim">
                Email
              </label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2"
              />
            </div>
            {mode !== "forgot_password" && (
              <div>
                <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wide text-foreground-dim">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2"
                />
              </div>
            )}

            {mode === "sign_in" && (
              <button
                type="button"
                onClick={() => {
                  setMode("forgot_password");
                  setError(null);
                }}
                className="text-sm text-foreground-dim hover:text-foreground"
              >
                Forgot password?
              </button>
            )}

            {error && <FormError>{error}</FormError>}

            <Button type="submit" disabled={loading} size="lg" block>
              {loading
                ? "Please wait…"
                : mode === "sign_in"
                  ? "Sign in"
                  : mode === "sign_up"
                    ? "Create account"
                    : "Send reset link"}
            </Button>
          </form>
        )}

        {!checkEmail && !resetSent && (
          <button
            type="button"
            onClick={() => {
              setMode(mode === "sign_up" ? "sign_in" : mode === "sign_in" ? "sign_up" : "sign_in");
              setError(null);
            }}
            className="mt-5 text-sm text-foreground-dim hover:text-foreground"
          >
            {mode === "sign_in"
              ? "Need an account? Create one"
              : mode === "sign_up"
                ? "Already have an account? Sign in"
                : "Back to sign in"}
          </button>
        )}
      </div>
    </div>
  );
}
