"use client";

import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  getServerSnapshot,
  getSnapshot,
  setUserId,
  subscribe,
} from "@/lib/auth-store";

/** The selected user id (dev auth). Reactive across the app. */
export function useUserId(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The current user's full profile, loaded from the API. */
export function useCurrentUser() {
  const userId = useUserId();
  const query = useQuery({
    queryKey: ["me", userId],
    queryFn: api.me,
    enabled: !!userId,
  });
  return {
    userId,
    user: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    signOut: () => setUserId(null),
  };
}
