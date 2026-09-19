"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "sign_in" | "sign_up";

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
    } else {
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
    }
  }

  return (
    <div className="court-glow flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
          Hardwood Lab
        </p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground">
          {mode === "sign_in" ? "Welcome back" : "Start your team"}
        </h1>
        <p className="mt-1 text-sm text-foreground-dim">
          {mode === "sign_in" ? "Sign in to your household account." : "Create your household account."}
        </p>

        {checkEmail ? (
          <div className="mt-6 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm text-foreground">
            Check <strong>{email}</strong> for a confirmation link to finish creating your account.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wide text-foreground-dim">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-xl border border-line bg-elevated px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-accent"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wide text-foreground-dim">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-xl border border-line bg-elevated px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-accent"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {loading ? "Please wait…" : mode === "sign_in" ? "Sign in" : "Create account"}
            </button>
          </form>
        )}

        {!checkEmail && (
          <button
            type="button"
            onClick={() => {
              setMode(mode === "sign_in" ? "sign_up" : "sign_in");
              setError(null);
            }}
            className="mt-5 text-sm text-foreground-dim hover:text-foreground"
          >
            {mode === "sign_in"
              ? "Need an account? Create one"
              : "Already have an account? Sign in"}
          </button>
        )}
      </div>
    </div>
  );
}
