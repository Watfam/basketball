"use client";

import { useTransition } from "react";
import { deleteCalibrationRun } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function DeleteCalibrationButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="danger"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Delete this calibration?")) return;
        startTransition(async () => {
          const res = await deleteCalibrationRun(id);
          if (res.error) window.alert(res.error);
        });
      }}
      className="mt-2"
    >
      {pending ? "Deleting…" : "Delete"}
    </Button>
  );
}
