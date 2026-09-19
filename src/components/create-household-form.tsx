"use client";

import { useState, useTransition } from "react";
import { createHousehold } from "@/app/actions";

export function CreateHouseholdForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("name", name);
    startTransition(async () => {
      const result = await createHousehold(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
        Set up your household
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        This is the account your player profiles live under — e.g. &ldquo;The Watfords&rdquo;.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <input
          type="text"
          required
          placeholder="Household name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          {pending ? "Creating…" : "Create household"}
        </button>
      </form>
    </div>
  );
}
