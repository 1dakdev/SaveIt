// Dev convenience: remember accounts we've signed in as, so the switcher can
// offer one-tap login without a backend "list users" endpoint.

export interface KnownUser {
  id: string;
  name: string;
  email?: string;
}

const KEY = "sankofa.knownUsers";

export function getKnownUsers(): KnownUser[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function rememberUser(user: KnownUser) {
  if (typeof window === "undefined") return;
  const existing = getKnownUsers().filter((u) => u.id !== user.id);
  const next = [user, ...existing].slice(0, 12);
  window.localStorage.setItem(KEY, JSON.stringify(next));
}

export function forgetUser(id: string) {
  if (typeof window === "undefined") return;
  const next = getKnownUsers().filter((u) => u.id !== id);
  window.localStorage.setItem(KEY, JSON.stringify(next));
}
