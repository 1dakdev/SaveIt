"use client";

import { useQueryClient } from "@tanstack/react-query";

/** Invalidate everything a circle action can affect, so the UI re-syncs. */
export function useCircleRefresh(circleId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["circle", circleId] }),
      qc.invalidateQueries({ queryKey: ["cycle"] }),
      qc.invalidateQueries({ queryKey: ["circles"] }),
      qc.invalidateQueries({ queryKey: ["messages", circleId] }),
      qc.invalidateQueries({ queryKey: ["me"] }),
    ]);
}
