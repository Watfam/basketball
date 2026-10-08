"use client";

import { useTransition } from "react";
import { deleteCalibrationRun } from "@/app/actions";

export function DeleteCalibrationButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Delete this calibration?")) return;
        startTransition(async () => {
          const res = await deleteCalibrationRun(id);
          if (res.error) window.alert(res.error);
        });
      }}
      className="mt-1 text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute hover:text-danger disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
