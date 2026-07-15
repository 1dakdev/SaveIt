// The single seam between "who is the user" and "how we prove it to the API".
//
// Today (dev mode) we identify the caller with an `x-user-id` header, chosen via
// the dev user-switcher and persisted in localStorage. To move to real OIDC,
// only `authHeaders()` needs to change — swap the header for
// `Authorization: Bearer <token>` and read the id from the verified session.

const STORAGE_KEY = "sankofa.devUserId";

let currentUserId: string | null = null;
const listeners = new Set<() => void>();

function readInitial(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

// Hydrate synchronously on the client so the first render is correct.
if (typeof window !== "undefined") {
  currentUserId = readInitial();
}

export function getUserId(): string | null {
  return currentUserId;
}

export function setUserId(id: string | null) {
  currentUserId = id;
  if (typeof window !== "undefined") {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  }
  listeners.forEach((l) => l());
}

/** useSyncExternalStore plumbing so React re-renders when the user switches. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): string | null {
  return currentUserId;
}

export function getServerSnapshot(): string | null {
  return null;
}

/** Auth headers sent with every API request. The OIDC swap happens here. */
export function authHeaders(): Record<string, string> {
  return currentUserId ? { "x-user-id": currentUserId } : {};
}
